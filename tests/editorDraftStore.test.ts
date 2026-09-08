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
  transform: { zoom: 0.8 + index / 10, rotation: index, x: -0.2 + index / 100, y: 0.4 - index / 100, flipX: false, flipY: false },
  fit: index % 2 ? 'cover' : 'contain',
  filter: index === 1 ? 'grayscale' : 'none',
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
  assert.equal(restored?.frameSlots['frame-7']?.[0]?.fit, 'cover')
  assert.equal(restored?.frameSlots['frame-7']?.[0]?.filter, 'grayscale')
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
  metadata.frameSlots.frame![0]!.transform.zoom = Number.NaN
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

test('abandoned draft TTL is a conservative 24 hours', () => {
  assert.equal(editorDraftTtlMs, 24 * 60 * 60 * 1000)
})

test('app reinitialization rediscovers and loads the exact IndexedDB draft without sessionStorage', async () => {
  const storage = new MemoryStorage()
  const recoveredIdentity = { sessionId: 'reinit-session', boothId: 'room-a', phoneNumber: '84905550123' }
  const photos = Array.from({ length: 9 }, (_, index) => photo(index + 20))
  const frameSlots = { 'frame-7': photos.map(slot) }
  const metadata = createEditorDraftMetadata(recoveredIdentity, {
    roomId: 'room-a', selectedTemplateId: 'frame-7', currentSlot: 4, frameSlots, completedFrameIds: ['frame-7'],
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
  assert.equal(restored?.frameSlots['frame-7']?.[1]?.filter, 'grayscale')
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
