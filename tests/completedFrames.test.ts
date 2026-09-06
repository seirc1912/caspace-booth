import assert from 'node:assert/strict'
import test from 'node:test'
import { completedFramesForOrder, isFrameComplete, type OrderFrame } from '../client/src/features/orders/completedFrames'
import type { FilledSlot, PhotoAsset, PrintTemplate } from '../client/src/types/selfBooth'

const photo: PhotoAsset = { id: 'photo', src: 'blob:photo', alt: 'Photo', source: 'phone' }
const filled = (filter: FilledSlot['filter'] = 'none'): FilledSlot => ({
  photo,
  filter,
  fit: 'contain',
  transform: { zoom: 1, rotation: 0, x: 0, y: 0, flipX: false, flipY: false },
})
const frame = (index: number, slotCount: number, slots: Array<FilledSlot | null>): OrderFrame => ({
  index,
  slots,
  template: { id: `frame-${index + 1}`, slots: Array.from({ length: slotCount }, (_, slotIndex) => ({ id: `slot-${slotIndex}` })) } as PrintTemplate,
})

test('zero completed frames blocks ordering', () => {
  assert.deepEqual(completedFramesForOrder([frame(0, 1, [null]), frame(1, 1, [null])]), [])
})

test('one completed frame is selected without rendering empty frames', () => {
  const frames = [frame(0, 1, [filled()]), ...Array.from({ length: 12 }, (_, index) => frame(index + 1, 1, [null]))]
  assert.deepEqual(completedFramesForOrder(frames).map(({ index }) => index), [0])
})

test('non-contiguous completed frames preserve display order', () => {
  const completed = new Set([0, 4, 9])
  const frames = Array.from({ length: 13 }, (_, index) => frame(index, 1, [completed.has(index) ? filled() : null]))
  assert.deepEqual(completedFramesForOrder(frames).map(({ index }) => index), [0, 4, 9])
})

test('twelve and thirteen completed frames retain their exact counts', () => {
  const twelve = Array.from({ length: 13 }, (_, index) => frame(index, 1, [index === 12 ? null : filled()]))
  const thirteen = Array.from({ length: 13 }, (_, index) => frame(index, 1, [filled()]))
  assert.equal(completedFramesForOrder(twelve).length, 12)
  assert.equal(completedFramesForOrder(thirteen).length, 13)
})

test('a partially filled multi-slot frame remains incomplete', () => {
  assert.equal(isFrameComplete(frame(0, 3, [filled(), filled(), null])), false)
  assert.equal(isFrameComplete(frame(0, 3, [filled(), filled(), filled()])), true)
})

test('partial ordering retains existing B&W and Original slot metadata', () => {
  const frames = [frame(0, 1, [filled('grayscale')]), frame(1, 1, [null]), frame(2, 1, [filled('none')])]
  const selected = completedFramesForOrder(frames)
  assert.deepEqual(selected.map(({ index }) => index), [0, 2])
  assert.equal(selected[0]?.slots[0]?.filter, 'grayscale')
  assert.equal(selected[1]?.slots[0]?.filter, 'none')
})
