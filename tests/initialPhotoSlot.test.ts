import assert from 'node:assert/strict'
import test from 'node:test'
import { createInitialPhotoSlot, initialPhotoTransform } from '../client/src/features/photos/initialPhotoSlot'
import type { PhotoAsset } from '../client/src/types/selfBooth'

const photo: PhotoAsset = { id: 'photo', src: 'blob:photo', alt: 'Original photo', source: 'phone' }

test('new and replacement photos initialize centered at a sensible contain fit', () => {
  assert.deepEqual(createInitialPhotoSlot(photo), { photo, fit: 'contain', filter: 'none', transform: initialPhotoTransform })
})

test('each initialization receives independent transform state', () => {
  const first = createInitialPhotoSlot(photo)
  const second = createInitialPhotoSlot(photo)
  assert.notEqual(first.transform, second.transform)
  first.transform.zoom = 2
  assert.equal(second.transform.zoom, 1)
})
