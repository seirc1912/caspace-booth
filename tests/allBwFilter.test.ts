import assert from 'node:assert/strict'
import test from 'node:test'
import { applyAllBwFilter, clearAllBwFilter, createPhotoSlotForAllBw } from '../client/src/features/photos/allBwFilter'
import type { FilledSlot, PhotoAsset } from '../client/src/types/selfBooth'

const photo = (id: string): PhotoAsset => ({ id, src: `blob:${id}`, alt: id, source: 'phone' })
const slot = (id: string, filter: 'none' | 'grayscale' = 'none'): FilledSlot => ({
  photo: photo(id),
  transform: { scale: 1.4, offsetX: -25, offsetY: 20, rotation: 90, flipX: true, grayscale: filter === 'grayscale' },
})
const filterOf = (item: FilledSlot | null | undefined) => item ? (item.transform.grayscale ? 'grayscale' : 'none') : undefined
const withoutGrayscale = (item: FilledSlot | null | undefined) => item ? { ...item.transform, grayscale: undefined } : item

test('All B&W applies grayscale to every assigned customer photo across frames', () => {
  const frames = { one: [slot('a'), null, slot('b', 'grayscale')], two: [slot('c'), slot('d')] }
  const result = applyAllBwFilter(frames)

  assert.deepEqual(Object.values(result).flat().filter(Boolean).map(filterOf), Array(4).fill('grayscale'))
  assert.equal(result.one?.[1], null)
})

test('turning All B&W off makes every assigned photo Original', () => {
  const frames = { one: [slot('a'), slot('b', 'grayscale')], two: [slot('c')] }
  const restored = clearAllBwFilter(applyAllBwFilter(frames))

  assert.deepEqual(Object.values(restored).flat().map(filterOf), ['none', 'none', 'none'])
})

test('new and replacement photos added while active are B&W and restore to Original', () => {
  const original = { one: [slot('a', 'grayscale'), null] }
  const enabled = applyAllBwFilter(original)
  enabled.one![1] = createPhotoSlotForAllBw(photo('new'), true)
  enabled.one![0] = createPhotoSlotForAllBw(photo('replacement'), true)

  assert.deepEqual(enabled.one?.map(filterOf), ['grayscale', 'grayscale'])
  assert.deepEqual(clearAllBwFilter(enabled).one?.map(filterOf), ['none', 'none'])
})

test('repeated All B&W toggles do not corrupt filters or transforms', () => {
  const frames = { one: [slot('a'), slot('b', 'grayscale')], two: [slot('c')] }
  const originalTransforms = Object.values(frames).flat().map(withoutGrayscale)
  let current = frames
  for (let count = 0; count < 2; count += 1) {
    current = clearAllBwFilter(applyAllBwFilter(current))
  }

  assert.deepEqual(Object.values(current).flat().map(filterOf), ['none', 'none', 'none'])
  assert.deepEqual(Object.values(current).flat().map(withoutGrayscale), originalTransforms)
})
