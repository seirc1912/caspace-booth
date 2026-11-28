import assert from 'node:assert/strict'
import test from 'node:test'
import { createInitialPhotoSlot } from '../client/src/features/photos/initialPhotoSlot'
import type { PhotoAsset } from '../client/src/types/selfBooth'

const photo: PhotoAsset = { id: 'photo', src: 'blob:photo', alt: 'Original photo', source: 'phone' }

test('new and replacement photos start covering their slot, centred (no empty edges)', () => {
  assert.deepEqual(createInitialPhotoSlot(photo), { photo, transform: { scale: 1, offsetX: 0, offsetY: 0, rotation: 0, flipX: false, grayscale: false } })
  assert.equal(createInitialPhotoSlot(photo, true).transform.grayscale, true, 'All B&W: new photos start B&W')
})

test('each initialization receives independent transform state', () => {
  const first = createInitialPhotoSlot(photo)
  const second = createInitialPhotoSlot(photo)
  assert.notEqual(first.transform, second.transform)
  first.transform.scale = 2
  assert.equal(second.transform.scale, 1)
})
