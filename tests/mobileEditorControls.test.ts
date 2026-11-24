import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { adjustmentFromPointer, clampAdjustment, stepAdjustment } from '../client/src/features/photos/manualAdjustments'
import { pressHoldDelayMs, pressHoldRepeatMs } from '../client/src/components/editor/PressHoldButton'

test('zoom buttons adjust exactly one percentage point and respect existing bounds', () => {
  assert.equal(stepAdjustment(1.5, 0.01, 0.25, 6), 1.51)
  assert.equal(stepAdjustment(1.5, -0.01, 0.25, 6), 1.49)
  assert.equal(stepAdjustment(6, 0.01, 0.25, 6), 6)
  assert.equal(stepAdjustment(0.25, -0.01, 0.25, 6), 0.25)
})

test('horizontal and vertical buttons move one small step without separate state', () => {
  assert.equal(stepAdjustment(0, -0.01, -1, 1), -0.01)
  assert.equal(stepAdjustment(0, 0.01, -1, 1), 0.01)
  assert.equal(stepAdjustment(-1, -0.01, -1, 1), -1)
  assert.equal(stepAdjustment(1, 0.01, -1, 1), 1)
  assert.equal(clampAdjustment(2, -1, 1), 1)
})

test('track taps and captured drags map safely across the full slider range', () => {
  assert.equal(adjustmentFromPointer(100, 100, 200, -1, 1), -1)
  assert.equal(adjustmentFromPointer(200, 100, 200, -1, 1), 0)
  assert.equal(adjustmentFromPointer(300, 100, 200, -1, 1), 1)
  assert.equal(adjustmentFromPointer(50, 100, 200, -1, 1), -1)
  assert.equal(adjustmentFromPointer(350, 100, 200, -1, 1), 1)
})

test('mobile editor slider has 44px controls, pointer capture, cancellation, and local touch lock', () => {
  const toolbar = readFileSync(new URL('../client/src/components/editor/CropToolbar.tsx', import.meta.url), 'utf8')
  const holdButton = readFileSync(new URL('../client/src/components/editor/PressHoldButton.tsx', import.meta.url), 'utf8')
  const composer = readFileSync(new URL('../client/src/pages/ComposerPage.tsx', import.meta.url), 'utf8')
  assert.match(toolbar, /className="relative flex h-11[^\"]*touch-none/)
  assert.match(toolbar, /setPointerCapture\(event\.pointerId\)/)
  assert.match(toolbar, /onPointerCancel=\{finishPointer\}/)
  assert.match(toolbar, /hasPointerCapture\(event\.pointerId\)/)
  assert.match(toolbar, /disabled=\{value <= min\} onStep=\{\(\) => adjust\(-step\)\}/)
  assert.match(toolbar, /disabled=\{value >= max\} onStep=\{\(\) => adjust\(step\)\}/)
  assert.match(holdButton, /className="grid size-11[^\"]*touch-none select-none[^\"]*\[-webkit-touch-callout:none\][^\"]*\[-webkit-user-select:none\]/)
  assert.match(composer, /className="overflow-x-hidden" footer=\{false\}/, 'editor: no horizontal scroll, no site footer')
  assert.match(holdButton, /children: ReactNode/, 'SVG icons instead of − / + glyphs')
})

test('press-and-hold controls use the required timing and stop paths without duplicate pointer clicks', () => {
  const holdButton = readFileSync(new URL('../client/src/components/editor/PressHoldButton.tsx', import.meta.url), 'utf8')
  assert.equal(pressHoldDelayMs, 350)
  assert.equal(pressHoldRepeatMs, 60)
  assert.match(holdButton, /onPointerDown=\{start\}/)
  assert.match(holdButton, /onPointerUp=\{stop\}/)
  assert.match(holdButton, /onPointerCancel=\{stop\}/)
  assert.match(holdButton, /onLostPointerCapture=\{\(\) => clearTimers\(\)\}/)
  assert.match(holdButton, /useEffect\(\(\) => clearTimers, \[\]\)/)
  assert.match(holdButton, /event\.detail === 0/)
  assert.match(holdButton, /onContextMenu=\{\(event\) => event\.preventDefault\(\)\}/)
})

test('"Khung khác" sheet lists every frame of the room with its done / in-progress / empty state', () => {
  const sheet = readFileSync(new URL('../client/src/components/editor/FrameSwitcherSheet.tsx', import.meta.url), 'utf8')
  const composer = readFileSync(new URL('../client/src/pages/ComposerPage.tsx', import.meta.url), 'utf8')
  const app = readFileSync(new URL('../client/src/CustomerApp.tsx', import.meta.url), 'utf8')
  assert.match(sheet, /frames\.map\(\(frame, index\)/)
  assert.match(sheet, /aria-current=\{current \? 'true' : undefined\}/)
  assert.match(sheet, /'Đủ ảnh'/)
  assert.match(sheet, /`Đã ghép \$\{frame\.filledCount\}\/\$\{frame\.slotCount\} ô`/)
  assert.match(sheet, /Chưa có ảnh/)
  assert.match(composer, /<FrameSwitcherSheet/)
  assert.match(composer, /onSelectFrame\(index\)/)
  assert.match(app, /frames=\{editorFrames\}/)
  assert.doesNotMatch(composer, /FrameSelector|Frame \{frameIndex \+ 1\}/, 'the Frame 1–10 tab row is gone')
})
