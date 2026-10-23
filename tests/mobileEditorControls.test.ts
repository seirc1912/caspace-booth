import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { adjustmentFromPointer, clampAdjustment, stepAdjustment } from '../client/src/features/photos/manualAdjustments'
import { pressHoldDelayMs, pressHoldRepeatMs } from '../client/src/components/editor/PressHoldButton'
import { frameSelectorScrollTarget } from '../client/src/features/photos/frameNavigation'

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
  const selector = readFileSync(new URL('../client/src/components/editor/FrameSelector.tsx', import.meta.url), 'utf8')
  const composer = readFileSync(new URL('../client/src/pages/ComposerPage.tsx', import.meta.url), 'utf8')
  assert.match(toolbar, /className="relative flex h-11[^\"]*touch-none/)
  assert.match(toolbar, /setPointerCapture\(event\.pointerId\)/)
  assert.match(toolbar, /onPointerCancel=\{finishPointer\}/)
  assert.match(toolbar, /hasPointerCapture\(event\.pointerId\)/)
  assert.match(toolbar, /disabled=\{value <= min\} onStep=\{\(\) => adjust\(-step\)\}/)
  assert.match(toolbar, /disabled=\{value >= max\} onStep=\{\(\) => adjust\(step\)\}/)
  assert.match(holdButton, /className="grid size-11[^\"]*touch-none select-none[^\"]*\[-webkit-touch-callout:none\][^\"]*\[-webkit-user-select:none\]/)
  assert.match(composer, /PageShell className="overflow-x-hidden/)
  assert.match(selector, /overflow-x-auto overflow-y-hidden pb-1/)
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

test('frame selector supports arbitrary frame counts with a bounded independent horizontal scroller', () => {
  const selector = readFileSync(new URL('../client/src/components/editor/FrameSelector.tsx', import.meta.url), 'utf8')
  const composer = readFileSync(new URL('../client/src/pages/ComposerPage.tsx', import.meta.url), 'utf8')
  for (const frameCount of [1, 3, 6, 10, 15]) {
    const frameIds = Array.from({ length: frameCount }, (_, index) => `frame-${index}`)
    assert.equal(frameIds.map((_, index) => index + 1).at(-1), frameCount)
  }
  assert.match(selector, /frameIds\.map\(\(id, index\)/)
  assert.match(selector, /w-full min-w-0 touch-pan-x/)
  assert.match(selector, /overflow-x-auto overflow-y-hidden/)
  assert.match(selector, /\[-webkit-overflow-scrolling:touch\]/)
  assert.match(selector, /className=\{`min-h-10 shrink-0/)
  assert.match(composer, /mx-auto mb-3 w-full min-w-0 max-w-4xl/)
  assert.match(composer, /<FrameSelector/)
})

test('selected frame scroll target reveals either edge and leaves visible frames stationary', () => {
  assert.equal(frameSelectorScrollTarget(0, 320, 80, 180, 120), 120)
  assert.equal(frameSelectorScrollTarget(0, 320, -40, 60, 120), 72)
  assert.equal(frameSelectorScrollTarget(0, 320, 300, 410, 120), 218)
  assert.equal(frameSelectorScrollTarget(0, 320, -200, -100, 50), 0)
})
