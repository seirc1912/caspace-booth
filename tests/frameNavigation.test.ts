import assert from 'node:assert/strict'
import test from 'node:test'
import { nextFrameIndex } from '../client/src/features/photos/frameNavigation'

test('skip advances exactly one frame even when the current frame is empty', () => {
  assert.equal(nextFrameIndex(0, 4), 1)
  assert.equal(nextFrameIndex(1, 4), 2)
  assert.equal(nextFrameIndex(2, 4), 3)
})

test('skip is unavailable on the last frame and never wraps', () => {
  assert.equal(nextFrameIndex(3, 4), null)
  assert.equal(nextFrameIndex(0, 1), null)
})
