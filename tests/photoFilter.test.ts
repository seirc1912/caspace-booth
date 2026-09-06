import assert from 'node:assert/strict'
import test from 'node:test'
import { drawWithPhotoFilter, photoFilterCss, withPhotoFilter } from '../client/src/features/photos/photoFilter'
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
