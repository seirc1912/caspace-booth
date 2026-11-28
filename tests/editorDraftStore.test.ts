import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  clearActiveEditorDraftLocator,
  clearEditorDraft,
  createEditorDraftMetadata,
  editorDraftPhotoIds,
  editorDraftScopeKey,
  editorDraftTtlMs,
  findActiveEditorDraftLocator,
  hydrateEditorDraft,
  loadEditorDraft,
  persistPhotoOnce,
  saveActiveEditorDraftLocator,
  saveEditorDraft,
} from '../client/src/features/drafts/editorDraftStore'
import type { FilledSlot, PhotoAsset } from '../client/src/types/selfBooth'

const identity = { sessionId: 'session-a', boothId: 'room-a', phoneNumber: '84901234567' }
const photo = (index: number): PhotoAsset => ({ id: `photo-${index}`, src: `blob:photo-${index}`, previewSrc: `blob:preview-${index}`, alt: `Photo ${index}`, source: 'phone' })
const slot = (asset: PhotoAsset, index: number): FilledSlot => ({
  photo: asset,
  transform: { scale: 1 + index / 10, rotation: ([0, 90, 180, 270] as const)[index % 4]!, offsetX: -20 + index, offsetY: 40 - index, flipX: index % 2 === 1, grayscale: index === 1 },
})

class MemoryStorage {
  private readonly values = new Map<string, string>()
  getItem(key: string) { return this.values.get(key) ?? null }
  setItem(key: string, value: string) { this.values.set(key, value) }
  removeItem(key: string) { this.values.delete(key) }
}

test('draft scope isolates session, room, and customer identity', () => {
  const current = editorDraftScopeKey(identity)
  assert.notEqual(current, editorDraftScopeKey({ ...identity, sessionId: 'session-b' }))
  assert.notEqual(current, editorDraftScopeKey({ ...identity, boothId: 'room-b' }))
  assert.notEqual(current, editorDraftScopeKey({ ...identity, phoneNumber: '84909999999' }))
})

test('single photo assignment and current frame restore with exact metadata', () => {
  const asset = photo(1)
  const filled = slot(asset, 1)
  const metadata = createEditorDraftMetadata(identity, {
    roomId: 'room-a', selectedTemplateId: 'frame-7', currentSlot: 0,
    frameSlots: { 'frame-7': [filled] }, completedFrameIds: ['frame-7'],
  }, [asset.id], 1_000)
  const restored = hydrateEditorDraft(metadata, [asset])

  assert.equal(restored?.selectedTemplateId, 'frame-7')
  assert.equal(restored?.currentSlot, 0)
  assert.deepEqual(restored?.completedFrameIds, ['frame-7'])
  assert.deepEqual(restored?.frameSlots['frame-7']?.[0]?.transform, filled.transform)
  assert.equal(restored?.frameSlots['frame-7']?.[0]?.transform.grayscale, true)
})

test('nine-photo frame restores every photo in its original slot', () => {
  const photos = Array.from({ length: 9 }, (_, index) => photo(index + 1))
  const metadata = createEditorDraftMetadata(identity, {
    roomId: 'room-a', selectedTemplateId: 'frame-9', currentSlot: null,
    frameSlots: { 'frame-9': photos.map(slot) }, completedFrameIds: ['frame-9'],
  }, photos.map((asset) => asset.id))
  const restored = hydrateEditorDraft(metadata, photos)

  assert.deepEqual(restored?.frameSlots['frame-9']?.map((item) => item?.photo.id), photos.map((asset) => asset.id))
  assert.deepEqual(restored?.uploadedPhotos.map((asset) => asset.id), photos.map((asset) => asset.id))
})

test('removed, missing, or corrupt photo references degrade to empty slots', () => {
  const asset = photo(1)
  const metadata = createEditorDraftMetadata(identity, {
    roomId: 'room-a', selectedTemplateId: 'frame', currentSlot: null,
    frameSlots: { frame: [slot(asset, 0), slot(photo(2), 2)] }, completedFrameIds: [],
  }, [asset.id])
  ;(metadata.frameSlots.frame![0]!.transform as { scale: number }).scale = Number.NaN
  const restored = hydrateEditorDraft(metadata, [asset])

  assert.deepEqual(restored?.frameSlots.frame, [null, null])
  assert.deepEqual(restored?.uploadedPhotos.map((item) => item.id), [asset.id])
})

test('replacement metadata retains only the latest photo reference', () => {
  const replacement = photo(2)
  const metadata = createEditorDraftMetadata(identity, {
    roomId: 'room-a', selectedTemplateId: 'frame', currentSlot: null,
    frameSlots: { frame: [slot(replacement, 0)] }, completedFrameIds: [],
  }, [replacement.id])

  assert.deepEqual([...editorDraftPhotoIds(metadata)], ['photo-2'])
})

test('All B&W enabled state survives draft hydration with per-slot filters', () => {
  const photos = [photo(1), photo(2), photo(3)]
  const frameSlots = { one: [slot(photos[0]!, 0), slot(photos[1]!, 1)], two: [slot(photos[2]!, 2)] }
  const metadata = createEditorDraftMetadata(identity, {
    roomId: 'room-a', selectedTemplateId: 'one', currentSlot: 0, frameSlots,
    completedFrameIds: ['one'], allBwEnabled: true,
  }, photos.map((asset) => asset.id))
  const restored = hydrateEditorDraft(metadata, photos)

  assert.equal(restored?.allBwEnabled, true)
})

test('a session saved before the editor upgrade ({ zoom, x, y } + fit/filter) is migrated once on load', () => {
  const photos = [photo(41), photo(42), photo(43)]
  const metadata = createEditorDraftMetadata(identity, {
    roomId: 'room-a', selectedTemplateId: 'one', currentSlot: 0, frameSlots: {}, completedFrameIds: [], allBwEnabled: false,
  }, photos.map((asset) => asset.id))
  metadata.frameSlots = { one: [
    { photoId: 'photo-41', transform: { zoom: 2, x: 0.1, y: -0.05, rotation: 88, flipX: false, flipY: false }, fit: 'cover', filter: 'grayscale' },
    { photoId: 'photo-42', transform: { zoom: 1.5, x: 0, y: 0, rotation: 0, flipX: true, flipY: true }, fit: 'contain', filter: 'none' },
    { photoId: 'photo-43', transform: { zoom: 9, x: 0, y: 0, rotation: -91 }, fit: 'cover' },
  ] }
  const restored = hydrateEditorDraft(metadata, photos)
  assert.deepEqual(restored?.frameSlots.one?.map((item) => item?.transform), [
    { scale: 2, offsetX: 10, offsetY: -5, rotation: 90, flipX: false, grayscale: true },
    { scale: 1, offsetX: 0, offsetY: 0, rotation: 180, flipX: false, grayscale: false },
    { scale: 3, offsetX: 0, offsetY: 0, rotation: 270, flipX: false, grayscale: false },
  ])
})

test('abandoned draft TTL is a conservative 24 hours', () => {
  assert.equal(editorDraftTtlMs, 24 * 60 * 60 * 1000)
})

test('app reinitialization rediscovers and loads the exact IndexedDB draft without sessionStorage', async () => {
  const storage = new MemoryStorage()
  const recoveredIdentity = { sessionId: 'reinit-session', boothId: 'room-a', phoneNumber: '84905550123' }
  const photos = Array.from({ length: 9 }, (_, index) => photo(index + 20))
  const frameSlots = { 'frame-7': photos.map((asset, index) => { const item = slot(asset, index); return { ...item, transform: { ...item.transform, grayscale: true } } }) }
  const metadata = createEditorDraftMetadata(recoveredIdentity, {
    roomId: 'room-a', selectedTemplateId: 'frame-7', currentSlot: 4, frameSlots, completedFrameIds: ['frame-7'], allBwEnabled: true,
  }, photos.map((asset) => asset.id))
  const scopeKey = editorDraftScopeKey(recoveredIdentity)

  await Promise.all(photos.map(async (asset, index) => {
    const blob = new Blob([`photo-${index}`], { type: 'image/jpeg' })
    const runtimeAsset = { ...asset, src: URL.createObjectURL(blob), previewSrc: undefined }
    try { await persistPhotoOnce(scopeKey, runtimeAsset) } finally { URL.revokeObjectURL(runtimeAsset.src) }
  }))
  await saveEditorDraft(metadata)
  saveActiveEditorDraftLocator(recoveredIdentity, storage)

  // Simulate a new browsing context: there is intentionally no sessionStorage
  // input. The re-entered phone discovers only its exact persistent locator.
  const rediscovered = findActiveEditorDraftLocator(recoveredIdentity.phoneNumber, storage)
  assert.deepEqual(rediscovered, recoveredIdentity)
  const restored = await loadEditorDraft(rediscovered!)
  assert.equal(restored?.selectedTemplateId, 'frame-7')
  assert.equal(restored?.currentSlot, 4)
  assert.deepEqual(restored?.completedFrameIds, ['frame-7'])
  assert.deepEqual(restored?.frameSlots['frame-7']?.map((item) => item?.photo.id), photos.map((asset) => asset.id))
  assert.deepEqual(restored?.frameSlots['frame-7']?.[1]?.transform, frameSlots['frame-7'][1]?.transform)
  assert.equal(restored?.frameSlots['frame-7']?.[1]?.transform.grayscale, true)
  assert.equal(restored?.allBwEnabled, true)
  restored?.uploadedPhotos.forEach((asset) => { URL.revokeObjectURL(asset.src); if (asset.previewSrc) URL.revokeObjectURL(asset.previewSrc) })

  assert.equal(findActiveEditorDraftLocator('84909999999', storage), null)
  clearActiveEditorDraftLocator(recoveredIdentity, storage)
  await clearEditorDraft(scopeKey)
})

test('clearing an older order cannot remove a newer locator for the same phone', () => {
  const storage = new MemoryStorage()
  const oldIdentity = { ...identity, sessionId: 'old-session' }
  const newIdentity = { ...identity, sessionId: 'new-session' }
  saveActiveEditorDraftLocator(newIdentity, storage)
  clearActiveEditorDraftLocator(oldIdentity, storage)
  assert.deepEqual(findActiveEditorDraftLocator(identity.phoneNumber, storage), newIdentity)
})

test('expired locators cannot rediscover abandoned customer drafts', () => {
  const storage = new MemoryStorage()
  saveActiveEditorDraftLocator(identity, storage, 1_000)
  assert.equal(findActiveEditorDraftLocator(identity.phoneNumber, storage, 1_000 + editorDraftTtlMs + 1), null)
})

test('missing IndexedDB rejects asynchronously so the app can keep editing', async () => {
  const available = globalThis.indexedDB
  Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: undefined })
  try { await assert.rejects(persistPhotoOnce(editorDraftScopeKey(identity), photo(1)), /IndexedDB is unavailable/) }
  finally { Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: available }) }
})
