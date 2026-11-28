import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { frameSignature, isFrameFilled, sendFrames, type SendableFrame } from '../client/src/features/orders/services/sendFrames.ts'

const slot = (id: string, zoom = 1) => ({ photo: { id, src: `blob:${id}`, alt: id, source: 'selfbooth' as const }, transform: { x: 0, y: 0, zoom, rotation: 0, flipX: false, flipY: false } })
const frame = (n: number): SendableFrame => ({ templateId: `t${n}`, frameNumber: n, template: { id: `t${n}` } as never, slots: [slot(`p${n}`)] as never })

test('a frame is sendable only when every slot is filled; any edit changes its signature', () => {
  assert.equal(isFrameFilled([slot('a')] as never), true)
  assert.equal(isFrameFilled([slot('a'), null] as never), false)
  assert.equal(isFrameFilled(undefined), false)
  assert.notEqual(frameSignature([slot('a')] as never), frameSignature([slot('a', 1.2)] as never))
  assert.equal(frameSignature([slot('a')] as never), frameSignature([slot('a')] as never))
})

test('frames render one at a time, upload in ≤ 2 lanes to the phone folder, and one failure does not stop the rest', async () => {
  let rendering = 0, peakRender = 0, uploading = 0, peakUpload = 0
  const uploads: Array<{ phone: string; requestId: string; name: string }> = []
  const thumbs: string[] = []
  const states: string[] = []
  const results = await sendFrames({
    frames: [frame(1), frame(2), frame(3), frame(4)],
    phone: '0947860616',
    submissionId: 'sub_12345678',
    render: async (item) => {
      rendering += 1; peakRender = Math.max(peakRender, rendering)
      await new Promise((resolve) => setTimeout(resolve, 3))
      rendering -= 1
      return new File([new Uint8Array([1])], `caspace-x-khung${item.frameNumber}.jpg`, { type: 'image/jpeg' })
    },
    onState: (id, state) => states.push(`${id}:${state}`),
  }, {
    upload: (async (input: { file: File; phone: string; requestId: string }) => {
      uploading += 1; peakUpload = Math.max(peakUpload, uploading)
      await new Promise((resolve) => setTimeout(resolve, 5))
      uploading -= 1
      if (input.requestId.endsWith('-f3')) throw new Error('network')
      uploads.push({ phone: input.phone, requestId: input.requestId, name: input.file.name })
    }) as never,
    thumbnail: (async (input: { requestId: string }) => { thumbs.push(input.requestId) }) as never,
  })
  assert.equal(peakRender, 1, 'canvas rendering is never parallel')
  assert.ok(peakUpload <= 2)
  assert.deepEqual(results.map((result) => result.ok), [true, true, false, true])
  assert.ok(uploads.every((item) => item.phone === '0947860616'))
  assert.deepEqual(uploads.map((item) => item.requestId).sort(), ['sub_12345678-f1', 'sub_12345678-f2', 'sub_12345678-f4'])
  assert.deepEqual(thumbs.sort(), ['sub_12345678-f1', 'sub_12345678-f2', 'sub_12345678-f4'], 'staff thumbnails for sent frames')
  assert.ok(states.includes('t3:failed') && states.includes('t4:sent'))
})

test('editor offers "Gửi khung cho quán" and keeps the per-frame Save Photo', () => {
  const app = readFileSync('client/src/CustomerApp.tsx', 'utf8')
  assert.match(app, /sendFrames\(\{ frames, phone: validPhone/)
  assert.match(app, /saveComposition\(/, 'Save Photo still saves to the phone')
  const composer = readFileSync('client/src/pages/ComposerPage.tsx', 'utf8')
  assert.match(composer, /onClick=\{onOpenSendFrames\}.*\{canContinue \? 'Tiếp tục'/, '"Tiếp tục" opens the send step once this frame is full')
  assert.match(app, /navigate\('\/gui-in'\)/, 'opens the "Gửi in" step')
  const page = readFileSync('client/src/pages/SendFramesPage.tsx', 'utf8')
  assert.match(page, /`Gửi \$\{count\} khung cho quầy in`/)
  assert.match(page, /Còn thiếu \{missing\} ảnh/)
  assert.match(page, /Ghép tiếp/)
})
