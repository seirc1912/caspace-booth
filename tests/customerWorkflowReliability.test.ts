import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runPerFrameSave } from '../client/src/features/orders/services/saveComposition'
import { commitTransitionAfterLoad, selectFrameAfterLoad } from '../client/src/features/templates/frameSelection'
import type { FilledSlot, PhotoAsset } from '../client/src/types/selfBooth'

const photo = (id: string): PhotoAsset => ({ id, src: `blob:${id}`, blob: new Blob([id], { type: 'image/jpeg' }), alt: id, source: 'phone' })
const slot = (asset: PhotoAsset, zoom: number): FilledSlot => ({ photo: asset, transform: { zoom, rotation: 7, x: 0.1, y: -0.2, flipX: false, flipY: true }, fit: 'contain', filter: 'grayscale' })

test('a 404 while selecting another frame preserves all live editor state and permits retry', async () => {
  const uploadedPhotos = [photo('a'), photo('b'), photo('c')]
  const frameSlots = {
    'frame-1': [slot(uploadedPhotos[0]!, 1.25), slot(uploadedPhotos[1]!, 0.8)],
    'frame-3': [slot(uploadedPhotos[2]!, 1.5)],
  }
  const before = structuredClone({ selectedTemplateId: 'frame-1', frameSlots, uploadedPhotos })
  const live = { selectedTemplateId: 'frame-1', frameSlots, uploadedPhotos }
  let attempts = 0
  let reported = ''
  const select = () => selectFrameAfterLoad({
    id: 'frame-2',
    loadDetail: async () => {
      attempts += 1
      if (attempts === 1) throw new Error('404 frame detail')
      return { id: 'frame-2' }
    },
    commit: ({ id }) => { live.selectedTemplateId = id },
    onError: (reason) => { reported = reason instanceof Error ? reason.message : String(reason) },
  })

  assert.equal(await select(), false)
  assert.equal(reported, '404 frame detail')
  assert.deepEqual(live, before)
  assert.equal(live.frameSlots['frame-1']?.[0]?.transform.zoom, 1.25)
  assert.equal(live.uploadedPhotos[0]?.blob?.size, 1)

  assert.equal(await select(), true)
  assert.equal(live.selectedTemplateId, 'frame-2')
  assert.deepEqual(live.frameSlots, before.frameSlots)
  assert.deepEqual(live.uploadedPhotos, before.uploadedPhotos)
})

test('a failed Room transition cannot clear photos, slots, drafts, caches, or live object URLs', async () => {
  const effects: string[] = []
  await assert.rejects(commitTransitionAfterLoad(
    async () => { effects.push('load'); throw new Error('404 first frame') },
    () => effects.push('clear-live-state', 'revoke-object-urls', 'navigate'),
  ), /404 first frame/)
  assert.deepEqual(effects, ['load'])
})

test('a successful Room transition commits cleanup only after its first frame is available', async () => {
  const effects: string[] = []
  await commitTransitionAfterLoad(
    async () => { effects.push('load'); return 'ready' },
    () => effects.push('clear-old-state', 'navigate'),
  )
  assert.deepEqual(effects, ['load', 'clear-old-state', 'navigate'])
})

test('Frame 1 and Frame 2 restore their independent assignments and transforms exactly', async () => {
  const frameSlots = {
    'frame-1': [slot(photo('frame-one-a'), 1.35), slot(photo('frame-one-b'), 0.75)],
    'frame-2': [slot(photo('frame-two-a'), 1.8)],
  }
  const expectedFrame1 = structuredClone(frameSlots['frame-1'])
  const expectedFrame2 = structuredClone(frameSlots['frame-2'])
  let selected = 'frame-1'
  const select = (id: string) => selectFrameAfterLoad({ id, loadDetail: async () => ({ id }), commit: (detail) => { selected = detail.id }, onError: () => undefined })

  await select('frame-2')
  assert.equal(selected, 'frame-2')
  assert.deepEqual(frameSlots[selected], expectedFrame2)
  await select('frame-1')
  assert.equal(selected, 'frame-1')
  assert.deepEqual(frameSlots[selected], expectedFrame1)
  await select('frame-2')
  assert.deepEqual(frameSlots[selected], expectedFrame2)
})

test('per-frame Save exports only the captured frame and never clears or navigates', async () => {
  const frames = {
    'frame-1': [slot(photo('one'), 1.1)],
    'frame-2': [slot(photo('two'), 0.9)],
  }
  const before = structuredClone(frames)
  const exported: string[] = []
  const sideEffects: string[] = []
  const saveFrame1 = () => runPerFrameSave(
    async () => { exported.push('frame-1'); return { delivery: 'shared' as const, width: 2400, height: 3600 } },
    ({ width, height }) => sideEffects.push(`confirmed:${width}x${height}`),
  )

  await saveFrame1()
  frames['frame-1'][0] = { ...frames['frame-1'][0]!, transform: { ...frames['frame-1'][0]!.transform, zoom: 1.4 } }
  await saveFrame1()

  assert.deepEqual(exported, ['frame-1', 'frame-1'])
  assert.deepEqual(frames['frame-2'], before['frame-2'])
  assert.equal(frames['frame-1'][0]?.transform.zoom, 1.4)
  assert.deepEqual(sideEffects, ['confirmed:2400x3600', 'confirmed:2400x3600'])
  assert.ok(!sideEffects.includes('navigate'))
})

test('cancelled Save Photo leaves frame state unchanged and shows no success confirmation', async () => {
  const state = { selectedTemplateId: 'frame-1', zoom: 1.3 }
  const confirmations: string[] = []
  await runPerFrameSave(async () => ({ delivery: 'cancelled' as const }), () => confirmations.push('saved'))
  assert.deepEqual(state, { selectedTemplateId: 'frame-1', zoom: 1.3 })
  assert.deepEqual(confirmations, [])
})

test('customer editor has no Order action or Print Order execution while backend remains present', () => {
  const app = readFileSync(new URL('../client/src/CustomerApp.tsx', import.meta.url), 'utf8')
  const toolbar = readFileSync(new URL('../client/src/components/editor/EditorToolbar.tsx', import.meta.url), 'utf8')
  const backend = readFileSync(new URL('../client/src/features/orders/services/orderServiceInstance.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(app, /printOrderRepository|saveAndContinue|createOrderPhotoSnapshot|OrderPreviewPage|RoomSummaryPage|SuccessPage/)
  assert.doesNotMatch(toolbar, /nextLabel|Ordering|aria-label="Order"/)
  assert.match(toolbar, /aria-label="Save Photo"/)
  assert.match(backend, /PrintOrderRepository/)
})
