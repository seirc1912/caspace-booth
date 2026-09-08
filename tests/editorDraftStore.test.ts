import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createEditorDraftMetadata,
  editorDraftPhotoIds,
  editorDraftScopeKey,
  editorDraftTtlMs,
  hydrateEditorDraft,
  persistPhotoOnce,
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

test('missing IndexedDB rejects asynchronously instead of crashing synchronously', async () => {
  await assert.rejects(persistPhotoOnce(editorDraftScopeKey(identity), photo(1)), /IndexedDB is unavailable/)
})
