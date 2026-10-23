import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { adjustmentFromPointer, clampAdjustment, stepAdjustment } from '../client/src/features/photos/manualAdjustments'

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
  const composer = readFileSync(new URL('../client/src/pages/ComposerPage.tsx', import.meta.url), 'utf8')
  assert.match(toolbar, /className="relative flex h-11[^\"]*touch-none/)
  assert.match(toolbar, /setPointerCapture\(event\.pointerId\)/)
  assert.match(toolbar, /onPointerCancel=\{finishPointer\}/)
  assert.match(toolbar, /hasPointerCapture\(event\.pointerId\)/)
  assert.match(toolbar, /className="grid size-11[^\"]*" disabled=\{value <= min\}/)
  assert.match(toolbar, /className="grid size-11[^\"]*" disabled=\{value >= max\}/)
  assert.match(composer, /PageShell className="overflow-x-hidden/)
  assert.match(composer, /overflow-x-auto pb-1/)
})
