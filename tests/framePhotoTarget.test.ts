import assert from 'node:assert/strict'
import test from 'node:test'
import { assignPhotosToFrameTarget, createFramePhotoTarget } from '../client/src/features/photos/framePhotoTarget'
import { assignPhotoToTarget } from '../client/src/features/photos/directPhotoTarget'
import { initialPhotoTransform } from '../client/src/features/photos/initialPhotoSlot'
import { basePhotoFitScale } from '../client/src/features/photos/photoFit'
import type { FilledSlot, PhotoAsset } from '../client/src/types/selfBooth'

const photo = (index: number): PhotoAsset => ({ id: `photo-${index}`, src: `blob:photo-${index}`, alt: `Photo ${index}`, source: 'phone' })
const existing = (index: number): FilledSlot => ({ photo: photo(index), transform: { ...initialPhotoTransform, x: 0.25 }, fit: 'contain', filter: 'grayscale' })
const emptySlots = (count: number) => Array.from({ length: count }, () => null)

test('three selected photos fill a three-slot frame in order with the existing initial state', () => {
  const slots = emptySlots(3)
  const result = assignPhotosToFrameTarget({}, createFramePhotoTarget('frame', slots), [photo(1), photo(2), photo(3)])
  assert.deepEqual(result.frame?.map((slot) => slot?.photo.id), ['photo-1', 'photo-2', 'photo-3'])
  assert.deepEqual(result.frame?.[0]?.transform, initialPhotoTransform)
  assert.equal(result.frame?.[0]?.fit, 'contain')
  assert.equal(result.frame?.[0]?.filter, 'none')
})

test('nine selected photos fill all nine slots deterministically', () => {
  const slots = emptySlots(9)
  const result = assignPhotosToFrameTarget({}, createFramePhotoTarget('frame', slots), Array.from({ length: 9 }, (_, index) => photo(index + 1)))
  assert.deepEqual(result.frame?.map((slot) => slot?.photo.id), Array.from({ length: 9 }, (_, index) => `photo-${index + 1}`))
})

test('selecting fewer photos fills the first empty slots and leaves the rest empty', () => {
  const slots = emptySlots(9)
  const result = assignPhotosToFrameTarget({}, createFramePhotoTarget('frame', slots), [photo(1), photo(2), photo(3), photo(4)])
  assert.deepEqual(result.frame?.map((slot) => slot?.photo.id ?? null), ['photo-1', 'photo-2', 'photo-3', 'photo-4', null, null, null, null, null])
})

test('partially filled frames keep existing photos and fill only empty slots', () => {
  const slots: Array<FilledSlot | null> = [existing(1), existing(2), existing(3), existing(4), null, null, null, null, null]
  const result = assignPhotosToFrameTarget({ frame: slots }, createFramePhotoTarget('frame', slots), [photo(5), photo(6), photo(7), photo(8), photo(9)])
  assert.deepEqual(result.frame?.map((slot) => slot?.photo.id), Array.from({ length: 9 }, (_, index) => `photo-${index + 1}`))
  assert.strictEqual(result.frame?.[0], slots[0])
})

test('extra picker files cannot exceed capacity or overwrite photos', () => {
  const slots: Array<FilledSlot | null> = [existing(1), null, null, null]
  const result = assignPhotosToFrameTarget({ frame: slots }, createFramePhotoTarget('frame', slots), Array.from({ length: 6 }, (_, index) => photo(index + 2)))
  assert.deepEqual(result.frame?.map((slot) => slot?.photo.id), ['photo-1', 'photo-2', 'photo-3', 'photo-4'])
})

test('returning from a backgrounded picker targets the captured frame and skips newly occupied slots', () => {
  const capturedSlots: Array<FilledSlot | null> = [null, null, null]
  const current = { first: [existing(9), null, null], second: emptySlots(3) }
  const result = assignPhotosToFrameTarget(current, createFramePhotoTarget('first', capturedSlots), [photo(1), photo(2), photo(3)])
  assert.deepEqual(result.first.map((slot) => slot?.photo.id ?? null), ['photo-9', 'photo-1', 'photo-2'])
  assert.strictEqual(result.second, current.second)
})

test('single and multi add initialize the same photo in the same slot identically', () => {
  const selected = photo(1)
  const single = assignPhotoToTarget({}, { templateId: 'frame', slotIndex: 0, slotCount: 1 }, selected)
  const multi = assignPhotosToFrameTarget({}, createFramePhotoTarget('frame', [null]), [selected])
  assert.deepEqual(multi.frame?.[0], single.frame?.[0])
})

test('each assigned photo computes its contain fit independently for its actual slot aspect ratio', () => {
  const image = { width: 1200, height: 800 }
  assert.equal(basePhotoFitScale(image, { width: 300, height: 600 }, 'contain'), 0.25)
  assert.equal(basePhotoFitScale(image, { width: 600, height: 300 }, 'contain'), 0.375)
  assert.equal(basePhotoFitScale(image, { width: 400, height: 400 }, 'contain'), 1 / 3)
})
