import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import test from 'node:test'
import { clearEditorDraft, createEditorDraftMetadata, editorDraftScopeKey, loadEditorDraft, persistPhotoOnce, saveEditorDraft } from '../client/src/features/drafts/editorDraftStore'
import { createOrderPhotoSnapshot, runFailureSafeOrder } from '../client/src/features/orders/services/orderPhotoSnapshot'
import { fetchRemoteAsset } from '../client/src/features/orders/services/renderComposition'
import type { FilledSlot, PhotoAsset, PrintTemplate } from '../client/src/types/selfBooth'

const identity = { sessionId: 'failure-session', boothId: 'failure-room', phoneNumber: '84901112222' }
const sourceBlob = new Blob(['customer-photo'], { type: 'image/jpeg' })
const photo: PhotoAsset = { id: 'photo-1', src: 'blob:live-photo', blob: sourceBlob, alt: 'Customer photo', source: 'phone' }
const filled: FilledSlot = { photo, transform: { zoom: 1.2, rotation: 3, x: 0.1, y: -0.1 }, fit: 'cover', filter: 'grayscale' }
const template = { id: 'frame-1', slots: [{ id: 'slot-1' }], canvas: { width: 100, height: 100 }, elements: [], variables: [] } as unknown as PrintTemplate

async function failureAt(stage: string) {
  const editor = { photos: [photo], slots: [filled], draftPresent: true }
  let cleanupCalls = 0
  await assert.rejects(runFailureSafeOrder(async () => { throw new Error(`${stage} failed`) }, async () => { cleanupCalls += 1; editor.photos = []; editor.slots = []; editor.draftPresent = false }), new RegExp(stage))
  assert.equal(cleanupCalls, 0)
  assert.deepEqual(editor.photos, [photo])
  assert.deepEqual(editor.slots, [filled])
  assert.equal(editor.draftPresent, true)
}

test('A customer image decode failure preserves photos and draft', () => failureAt('customer decode'))
test('B remote template failure preserves photos and draft', () => failureAt('remote template'))
test('C canvas export failure preserves photos and draft', () => failureAt('canvas export'))
test('D upload failure preserves photos and draft', () => failureAt('upload'))
test('E submit RPC failure preserves photos and draft', () => failureAt('submit'))

test('remote transient fetch has a bounded initial attempt plus two retries', async () => {
  const originalFetch = globalThis.fetch
  let calls = 0
  globalThis.fetch = (async () => { calls += 1; return new Response('', { status: 503 }) }) as typeof fetch
  try { await assert.rejects(fetchRemoteAsset('https://assets.example/frame.png', 'template-background'), /HTTP 503|fetch failed/); assert.equal(calls, 3) }
  finally { globalThis.fetch = originalFetch }
})

test('F partial upload failure preserves state and retry reuses idempotent frame uploads', async () => {
  const uploaded = new Set<string>()
  const editorPhotos = [photo]
  let attempt = 0
  const placeFrames = async () => {
    attempt += 1
    for (const id of ['frame-1', 'frame-2', 'frame-3']) {
      if (uploaded.has(id)) continue
      if (attempt === 1 && id === 'frame-3') throw new Error('frame-3 render failed')
      uploaded.add(id)
    }
    return { id: 'confirmed-order' }
  }
  await assert.rejects(runFailureSafeOrder(placeFrames, async () => { editorPhotos.length = 0 }), /render failed/)
  assert.deepEqual([...uploaded], ['frame-1', 'frame-2'])
  assert.equal(editorPhotos.length, 1)
  await runFailureSafeOrder(placeFrames, async () => { editorPhotos.length = 0 })
  assert.deepEqual([...uploaded], ['frame-1', 'frame-2', 'frame-3'])
  assert.equal(editorPhotos.length, 0)
})

test('G successful order cleans up only after confirmed submit', async () => {
  const events: string[] = []
  await runFailureSafeOrder(async () => { events.push('submit-confirmed'); return { id: 'order-1' } }, async () => { events.push('cleanup') })
  assert.deepEqual(events, ['submit-confirmed', 'cleanup'])
})

test('H attempt-owned object URLs remain valid until rendering settles', async () => {
  const revoked: string[] = []
  const snapshot = await createOrderPhotoSnapshot([{ template, index: 0, slots: [filled] }], {} as never, {
    readBlob: async () => { throw new Error('canonical Blob should be used') },
    createObjectURL: () => 'blob:order-snapshot',
    revokeObjectURL: (url) => revoked.push(url),
  })
  assert.equal(snapshot.frames[0]?.slots[0]?.photo.src, 'blob:order-snapshot')
  await Promise.resolve()
  assert.deepEqual(revoked, [])
  snapshot.release()
  snapshot.release()
  assert.deepEqual(revoked, ['blob:order-snapshot'])
})

test('I failed order leaves a nine-photo IndexedDB draft restorable after reload', async () => {
  const scope = editorDraftScopeKey(identity)
  const photos = Array.from({ length: 9 }, (_, index) => ({ ...photo, id: `reload-${index}`, src: `blob:reload-${index}`, blob: new Blob([`photo-${index}`], { type: 'image/jpeg' }) }))
  await Promise.all(photos.map((asset) => persistPhotoOnce(scope, asset)))
  const frameSlots = { 'frame-1': photos.map((asset, index) => ({ ...filled, photo: asset, transform: { ...filled.transform, zoom: 1 + index / 10 } })) }
  await saveEditorDraft(createEditorDraftMetadata(identity, { roomId: identity.boothId, selectedTemplateId: 'frame-1', currentSlot: 4, frameSlots, completedFrameIds: ['frame-1'], allBwEnabled: true }, photos.map((asset) => asset.id)))
  await assert.rejects(runFailureSafeOrder(async () => { throw new Error('forced upload failure') }, async () => clearEditorDraft(scope)))
  const restored = await loadEditorDraft(identity)
  assert.equal(restored?.uploadedPhotos.length, 9)
  assert.equal(restored?.frameSlots['frame-1']?.[4]?.transform.zoom, 1.4)
  assert.equal(restored?.frameSlots['frame-1']?.[0]?.filter, 'grayscale')
  assert.equal(restored?.allBwEnabled, true)
  restored?.uploadedPhotos.forEach((asset) => { URL.revokeObjectURL(asset.src); if (asset.previewSrc) URL.revokeObjectURL(asset.previewSrc) })
  await clearEditorDraft(scope)
})
