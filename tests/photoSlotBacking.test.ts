import assert from 'node:assert/strict'
import test from 'node:test'
import { fillPhotoSlotBacking, photoSlotBackingColor } from '../client/src/features/photos/photoSlotBacking'

test('photo-slot backing is opaque white and uses the exact slot rectangle', () => {
  const calls: Array<[number, number, number, number]> = []
  const context = {
    fillStyle: 'transparent',
    fillRect: (x: number, y: number, width: number, height: number) => calls.push([x, y, width, height]),
  }

  fillPhotoSlotBacking(context, 120, 240, 600, 900)

  assert.equal(photoSlotBackingColor, '#FFFFFF')
  assert.equal(context.fillStyle, '#FFFFFF')
  assert.deepEqual(calls, [[120, 240, 600, 900]])
})
