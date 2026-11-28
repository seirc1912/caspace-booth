import assert from 'node:assert/strict'
import test from 'node:test'
import { grayscaleRgbaPixels, photoFilterCss } from '../client/src/features/photos/photoFilter'
import { applyAllBwFilter } from '../client/src/features/photos/allBwFilter'
import type { FilledSlot, PhotoAsset } from '../client/src/types/selfBooth'

const photo: PhotoAsset = { id: 'photo', src: 'blob:photo', alt: 'Photo', source: 'phone' }
const slot: FilledSlot = { photo, transform: { scale: 1.5, rotation: 90, offsetX: 20, offsetY: -15, flipX: true, grayscale: false } }

test('B&W is a flag on the slot transform: the photo and its crop are untouched', () => {
  const grayscale = { ...slot, transform: { ...slot.transform, grayscale: true } }
  assert.equal(grayscale.photo, photo)
  assert.deepEqual({ ...grayscale.transform, grayscale: false }, slot.transform)
  assert.equal(photoFilterCss(grayscale.transform.grayscale), 'grayscale(1)')
  assert.equal(photoFilterCss(slot.transform.grayscale), 'none')
})

test('filter choices remain independent between photo slots', () => {
  const other: FilledSlot = { ...slot, photo: { ...photo, id: 'other' } }
  const result = applyAllBwFilter({ one: [slot] })
  assert.equal(result.one?.[0]?.transform.grayscale, true)
  assert.equal(other.transform.grayscale, false)
})

test('export fallback changes actual B&W photo pixels without touching alpha or the original source', () => {
  const original = new Uint8ClampedArray([220, 40, 10, 128, 10, 180, 240, 255])
  const rendered = grayscaleRgbaPixels(new Uint8ClampedArray(original))

  assert.deepEqual([...rendered], [76, 76, 76, 128, 148, 148, 148, 255])
  assert.deepEqual([...original], [220, 40, 10, 128, 10, 180, 240, 255])
})

test('mixed export pixels keep original photos, frame color, and white backing unchanged', () => {
  const blackAndWhitePhoto = grayscaleRgbaPixels(new Uint8ClampedArray([200, 20, 40, 255]))
  const originalPhoto = new Uint8ClampedArray([20, 80, 220, 255])
  const frame = new Uint8ClampedArray([240, 90, 30, 255])
  const whiteBacking = new Uint8ClampedArray([255, 255, 255, 255])

  assert.deepEqual([...blackAndWhitePhoto], [60, 60, 60, 255])
  assert.deepEqual([...originalPhoto], [20, 80, 220, 255])
  assert.deepEqual([...frame], [240, 90, 30, 255])
  assert.deepEqual([...whiteBacking], [255, 255, 255, 255])
})
