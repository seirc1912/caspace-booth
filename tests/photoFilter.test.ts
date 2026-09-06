import assert from 'node:assert/strict'
import test from 'node:test'
import { drawWithPhotoFilter, grayscaleRgbaPixels, photoFilterCss, withPhotoFilter } from '../client/src/features/photos/photoFilter'
import type { FilledSlot, PhotoAsset } from '../client/src/types/selfBooth'

const photo: PhotoAsset = { id: 'photo', src: 'blob:photo', alt: 'Photo', source: 'phone' }
const transform = { zoom: 0.75, rotation: 12, x: 0.2, y: -0.15, flipX: false, flipY: false }
const slot: FilledSlot = { photo, transform, fit: 'contain', filter: 'none' }

test('B&W is lightweight slot metadata and preserves the original photo and transform', () => {
  const grayscale = withPhotoFilter(slot, 'grayscale')

  assert.equal(grayscale.filter, 'grayscale')
  assert.equal(grayscale.photo, photo)
  assert.equal(grayscale.transform, transform)
  assert.equal(grayscale.fit, 'contain')
  assert.equal(photoFilterCss(grayscale.filter), 'grayscale(1)')
})

test('returning to Original preserves the exact zoom, position, and rotation', () => {
  const grayscale = withPhotoFilter(slot, 'grayscale')
  const original = withPhotoFilter(grayscale, 'none')

  assert.equal(original.filter, 'none')
  assert.equal(original.photo, photo)
  assert.equal(original.transform, transform)
  assert.deepEqual(original.transform, { zoom: 0.75, rotation: 12, x: 0.2, y: -0.15, flipX: false, flipY: false })
  assert.equal(photoFilterCss(original.filter), 'none')
})

test('filter choices remain independent between photo slots', () => {
  const other: FilledSlot = { ...slot, photo: { ...photo, id: 'other' } }
  const slots = [withPhotoFilter(slot, 'grayscale'), other]

  assert.equal(slots[0]?.filter, 'grayscale')
  assert.equal(slots[1]?.filter, 'none')
})

test('final rendering grayscales only the customer photo operation', () => {
  const context = { filter: 'none' }
  const operations: string[] = []

  operations.push(`frame:${context.filter}`)
  drawWithPhotoFilter(context, 'grayscale', () => operations.push(`photo:${context.filter}`))
  operations.push(`template:${context.filter}`)

  assert.deepEqual(operations, ['frame:none', 'photo:grayscale(1)', 'template:none'])
  assert.equal(context.filter, 'none')
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
