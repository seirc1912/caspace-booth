import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { clampOffset, computeContain, computeCover, createSlotTransform, effectivePrintDpi, focusTransform, minSlotScale, offsetLimits, pinchTransform, placePhoto, PRINT_WARNING_DPI, rubberBand, snapRotation, templateDpi, zoomAround } from '../client/src/features/photos/slotTransform'
import type { SlotTransform } from '../client/src/types/selfBooth'

const landscape = { width: 3000, height: 2000 }
const slot = { width: 600, height: 400 } // 3:2
const tall = { width: 400, height: 600 }
const t = (change: Partial<SlotTransform> = {}): SlotTransform => ({ ...createSlotTransform(), ...change })
const close = (actual: number, expected: number, message?: string) => assert.ok(Math.abs(actual - expected) < 1e-6, `${message ?? ''} ${actual} ≠ ${expected}`)

/** The four slot corners, mapped back into photo pixels, must lie inside the photo. */
function coversSlot(transform: SlotTransform, photo: { width: number; height: number }, box: { width: number; height: number }) {
  const p = placePhoto(transform, photo, box)
  const theta = -p.rotation * Math.PI / 180
  return [[0, 0], [box.width, 0], [0, box.height], [box.width, box.height]].every(([x, y]) => {
    let dx = x! - p.centerX; let dy = y! - p.centerY
    ;[dx, dy] = [dx * Math.cos(theta) - dy * Math.sin(theta), dx * Math.sin(theta) + dy * Math.cos(theta)]
    if (p.flipX) dx = -dx
    return Math.abs(dx) <= p.width / 2 + 1e-6 && Math.abs(dy) <= p.height / 2 + 1e-6
  })
}

test('computeCover: the (rotated) photo just covers the slot', () => {
  close(computeCover(3000, 2000, 600, 400), 0.2)
  close(computeCover(3000, 2000, 400, 600), 0.3)
  close(computeCover(3000, 2000, 600, 400, 90), 0.3, 'rotated 90°: 2000 wide × 3000 high must cover 600×400')
  close(computeCover(3000, 2000, 400, 600, 270), 0.2)
})

test('clampOffset: scale stays 1–3 and offsets never open a gap, for every rotation and flip', () => {
  close(clampOffset(t({ scale: 0.1 }), landscape, tall).scale, minSlotScale(landscape, tall, 0), 'zoom out stops when the whole photo fits')
  assert.equal(clampOffset(t({ scale: 9 }), landscape, slot).scale, 3)
  for (const rotation of [0, 90, 180, 270] as const) for (const flipX of [false, true]) for (const box of [slot, tall]) for (const scale of [1, 1.7, 3]) {
    const wild = clampOffset(t({ scale, rotation, flipX, offsetX: 400, offsetY: -400 }), landscape, box)
    assert.ok(coversSlot(wild, landscape, box), `gap at rot ${rotation} flip ${flipX} scale ${scale} box ${box.width}×${box.height}`)
    const limits = offsetLimits(wild, landscape, box)
    close(Math.abs(wild.offsetX), limits.x); close(Math.abs(wild.offsetY), limits.y)
  }
  assert.deepEqual(offsetLimits(t(), { width: 600, height: 400 }, slot), { x: 0, y: 0 }, 'same ratio at 100%: nothing to move')
})

test('placePhoto: screen (slot units) and print (pixels) give the same crop — only the scale differs', () => {
  const transform = t({ scale: 1.6, offsetX: 12, offsetY: -8, rotation: 90, flipX: true })
  const screen = placePhoto(transform, landscape, { width: 3, height: 2 })
  const print = placePhoto(transform, landscape, { width: 1800, height: 1200 })
  for (const key of ['width', 'height', 'centerX', 'centerY'] as const) close(print[key] / 600, screen[key])
  assert.equal(print.rotation, 90); assert.equal(print.flipX, true)
})

test('zoomAround keeps the photo point under the fingers / tap still', () => {
  const start = t({ scale: 1.5, offsetX: 5, offsetY: -3 })
  const anchor = { x: 120, y: -60 }
  const next = zoomAround(start, 2.25, anchor, landscape, slot)
  // Photo point under the anchor, in photo-centred slot units before and after.
  const before = { x: (anchor.x - start.offsetX / 100 * slot.width) / start.scale, y: (anchor.y - start.offsetY / 100 * slot.height) / start.scale }
  const after = { x: (anchor.x - next.offsetX / 100 * slot.width) / next.scale, y: (anchor.y - next.offsetY / 100 * slot.height) / next.scale }
  close(after.x, before.x); close(after.y, before.y)
  const back = zoomAround(next, 1, anchor, landscape, slot)
  assert.equal(back.scale, 1)
  assert.ok(coversSlot(back, landscape, slot), 'zooming out re-clamps the offsets')
})

test('rubberBand lets a drag overshoot a little; clampOffset snaps it back', () => {
  const limits = offsetLimits(t({ scale: 2 }), landscape, slot)
  const dragged = rubberBand(t({ scale: 2, offsetX: limits.x + 20 }), landscape, slot)
  assert.ok(dragged.offsetX > limits.x && dragged.offsetX < limits.x + 20)
  close(clampOffset(dragged, landscape, slot).offsetX, limits.x)
})

test('focusTransform centres a face as far as the edges allow (Tự xếp / Vừa ô); portrait default sits above centre', () => {
  const portrait = { width: 2000, height: 3000 }
  const wide = { width: 600, height: 300 }
  const top = focusTransform(t(), { x: 0.5, y: 0.4 }, portrait, wide)
  assert.ok(top.offsetY > 0, 'photo moves down so its upper part shows')
  assert.ok(coversSlot(top, portrait, wide))
  const edge = focusTransform(t(), { x: 0.5, y: 0 }, portrait, wide)
  close(edge.offsetY, offsetLimits(edge, portrait, wide).y, 'a face at the very top: clamped, never a gap')
  const rotated = focusTransform(t({ rotation: 90, scale: 2 }), { x: 0.25, y: 0.5 }, landscape, tall)
  assert.ok(coversSlot(rotated, landscape, tall))
  assert.ok(rotated.offsetY > 0, 'rotated 90°: the photo\'s left side is now at the top')
})

test('print-quality warning: dpi falls as the customer zooms; threshold is a 150 dpi constant', () => {
  assert.equal(PRINT_WARNING_DPI, 150)
  const dpi = templateDpi({ width: 600, height: 1800 }, '5x15')
  close(dpi, 600 / (5 / 2.54))
  assert.equal(templateDpi({ width: 600, height: 1800 }, 'không rõ'), 300)
  const original = { width: 600, height: 400 }
  const slotPx = { width: 540, height: 360 }
  assert.ok(effectivePrintDpi(t(), original, slotPx, dpi) > PRINT_WARNING_DPI)
  assert.ok(effectivePrintDpi(t({ scale: 3 }), original, slotPx, dpi) < PRINT_WARNING_DPI)
})

test('Chỉnh ô: Pointer Events + rAF, touch-action none, Safari pinch blocked, Huỷ/Đặt lại/Xong, a11y', () => {
  const editor = readFileSync('client/src/components/editor/SlotEditor.tsx', 'utf8')
  assert.match(editor, /requestAnimationFrame\(\(\) => \{ frame\.current = null; paint\(live\.current\) \}\)/, 'live CSS in rAF, no React render per move')
  assert.match(editor, /touch-none/)
  assert.match(editor, /addEventListener\('gesturestart', block\)/)
  assert.match(editor, /onClick=\{onCancel\} type="button">Huỷ/)
  assert.match(editor, /onClick=\{reset\} type="button">Đặt lại/)
  assert.match(editor, /Kéo để di chuyển · Chụm hoặc xoay 2 ngón · Chạm đúp: 2×/)
  assert.match(editor, /localStorage\.getItem\(HINT_KEY\)/)
  assert.match(editor, /Phóng lớn quá, ảnh in có thể bị mờ/)
  for (const label of ['Vừa ô', 'Xoay 90°', 'Lật ngang', 'Đen trắng', 'Thay ảnh']) assert.match(editor, new RegExp(`label="${label}"`))
  assert.match(editor, /ArrowLeft: \[-KEY_MOVE, 0\]/)
  assert.match(editor, /const KEY_MOVE = 5/)
  assert.match(editor, /aria-label="Mức phóng"/)
  assert.match(editor, /size-11/, '44px touch targets')
})

test('Bố cục drag & drop: tray photo onto a slot, slot onto slot swaps; touch needs an upward swipe or long press, a tap still works', () => {
  const composer = readFileSync('client/src/pages/ComposerPage.tsx', 'utf8')
  const canvas = readFileSync('client/src/components/editor/TemplateCanvas.tsx', 'utf8')
  const hook = readFileSync('client/src/hooks/useSelfBooth.ts', 'utf8')
  assert.match(canvas, /data-slot-index=\{index\}/)
  assert.match(composer, /if \(drag\.item\.kind === 'tray'\) placeBoothPhoto\(drag\.item\.photo, drag\.target\)/)
  assert.match(composer, /else if \(drag\.target !== drag\.item\.index\) onSwapSlots\?\.\(drag\.item\.index, drag\.target\)/)
  assert.match(composer, /drag\.item\.kind === 'tray' && dy < -10 && Math\.abs\(dy\) > Math\.abs\(dx\)/, 'sideways swipes keep scrolling the tray')
  assert.match(composer, /const LONG_PRESS_MS = 350/)
  assert.match(composer, /touch-pan-x/)
  assert.match(composer, /const openEditor = \(index: number\) => \{ if \(justDragged\.current\) return/, 'a drop never opens Chỉnh ô')
  assert.match(hook, /slotIndex === from \? current\[to\] \?\? null : slotIndex === to \? current\[from\] \?\? null : slot/)
})

test('Chỉnh ô has "Xoá ảnh"; face focus uses the browser detector, else MediaPipe, else the portrait default', () => {
  const editor = readFileSync('client/src/components/editor/SlotEditor.tsx', 'utf8')
  assert.match(editor, /label="Xoá ảnh"/)
  const focus = readFileSync('client/src/features/photos/faceFocus.ts', 'utf8')
  const pkg = JSON.parse(readFileSync('client/package.json', 'utf8'))
  assert.equal(pkg.dependencies['@mediapipe/tasks-vision'], '1.2.3')
  assert.match(focus, /tasks-vision@1\.2\.3\/wasm/, 'CDN runtime pinned to the installed version')
  assert.match(focus, /import\('@mediapipe\/tasks-vision'\)/, 'loaded only when needed')
  assert.match(focus, /\/models\/blaze_face_short_range\.tflite/)
  assert.match(focus, /return PORTRAIT_FOCUS/)
  const composer = readFileSync('client/src/pages/ComposerPage.tsx', 'utf8')
  assert.match(composer, /now\.transform\.scale !== 1 \|\| now\.transform\.offsetX !== 0/, 'a slow detector never overwrites the customer\'s own framing')
})

test('free two-finger rotation (old editor): any angle covers the slot at 100%+, snaps straight near quarter turns', () => {
  for (const rotation of [7, -23, 45, 133, -170]) for (const box of [slot, tall]) for (const scale of [1, 1.4, 3]) {
    const wild = clampOffset(t({ scale, rotation, offsetX: 500, offsetY: -500 }), landscape, box)
    assert.ok(coversSlot(wild, landscape, box), `gap at ${rotation}° scale ${scale}`)
    assert.ok(coversSlot(clampOffset(t({ scale, rotation }), landscape, box), landscape, box))
  }
  assert.equal(snapRotation(87), 90); assert.equal(snapRotation(-2.5), 0); assert.equal(snapRotation(181), 180); assert.equal(snapRotation(30), 30)
  close(computeCover(3000, 2000, 600, 400, 45), (600 * Math.SQRT1_2 + 400 * Math.SQRT1_2) / 2000)
})

test('zooming out below 100% fits the whole photo inside the slot (old "kéo nhỏ lại cả hình vào khung"), never outside it', () => {
  const min = minSlotScale(landscape, tall, 0)
  close(min, computeContain(3000, 2000, 400, 600) / computeCover(3000, 2000, 400, 600))
  assert.ok(min < 1)
  const small = clampOffset(t({ scale: min, offsetX: 80, offsetY: 80 }), landscape, tall)
  const p = placePhoto(small, landscape, tall)
  assert.ok(p.width <= tall.width + 1e-6 && p.height <= tall.height + 1e-6, 'the whole photo is visible')
  assert.ok(p.centerX - p.width / 2 >= -1e-6 && p.centerX + p.width / 2 <= tall.width + 1e-6, 'and stays inside the slot')
  assert.ok(p.centerY - p.height / 2 >= -1e-6 && p.centerY + p.height / 2 <= tall.height + 1e-6)
})

test('pinchTransform: twist and zoom keep the photo point under the fingers', () => {
  const start = t({ scale: 1.5, offsetX: 4, offsetY: -6, rotation: 10 })
  const from = { x: 50, y: -20 }; const to = { x: 70, y: 10 }
  const next = pinchTransform(start, from, to, 1.3, 25, slot)
  assert.equal(next.rotation, 35); close(next.scale, 1.95)
  // The photo point under `from` (in the photo's own unrotated, unscaled frame) is under `to` afterwards.
  const local = (tr: SlotTransform, point: { x: number; y: number }) => { const a = -tr.rotation * Math.PI / 180; const dx = point.x - tr.offsetX / 100 * slot.width; const dy = point.y - tr.offsetY / 100 * slot.height; return { x: (dx * Math.cos(a) - dy * Math.sin(a)) / tr.scale, y: (dx * Math.sin(a) + dy * Math.cos(a)) / tr.scale } }
  const before = local(start, from); const after = local(next, to)
  close(after.x, before.x); close(after.y, before.y)
})
