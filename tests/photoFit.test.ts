import assert from 'node:assert/strict'
import test from 'node:test'
import { basePhotoFitScale, clampUserPhotoZoom, effectivePhotoScale, maximumUserPhotoZoom, minimumUserPhotoZoom, type ImageSize } from '../client/src/features/photos/photoFit'

const cases: Array<{ name: string; photo: ImageSize; slot: ImageSize }> = [
  { name: 'landscape photo in portrait slot', photo: { width: 2400, height: 1200 }, slot: { width: 600, height: 1200 } },
  { name: 'portrait photo in landscape slot', photo: { width: 1200, height: 2400 }, slot: { width: 1200, height: 600 } },
  { name: 'portrait photo in portrait slot', photo: { width: 1200, height: 1800 }, slot: { width: 800, height: 1200 } },
  { name: 'landscape photo in landscape slot', photo: { width: 1800, height: 1200 }, slot: { width: 1200, height: 800 } },
  { name: 'square photo', photo: { width: 1600, height: 1600 }, slot: { width: 900, height: 900 } },
]

for (const { name, photo, slot } of cases) {
  test(`${name} uses a centered full-photo base fit at 100%`, () => {
    const base = basePhotoFitScale(photo, slot, 'contain')
    const fittedWidth = photo.width * base
    const fittedHeight = photo.height * base
    assert.ok(fittedWidth <= slot.width + Number.EPSILON || fittedHeight <= slot.height + Number.EPSILON)
    assert.ok(fittedWidth <= slot.width + Number.EPSILON)
    assert.ok(fittedHeight <= slot.height + Number.EPSILON)
    assert.equal(effectivePhotoScale(photo, slot, 'contain', 1), base)
  })
}

test('user zoom is relative to the initial slot-specific fit', () => {
  const photo = { width: 2400, height: 1200 }
  const slot = { width: 600, height: 1200 }
  const base = basePhotoFitScale(photo, slot, 'contain')
  for (const zoom of [0.8, 0.6, 1, 1.5]) {
    assert.equal(effectivePhotoScale(photo, slot, 'contain', zoom), base * zoom)
  }
})

test('the configured zoom range allows real zoom out below 100%', () => {
  assert.ok(minimumUserPhotoZoom < 1)
  assert.ok(maximumUserPhotoZoom > 1)
  assert.equal(clampUserPhotoZoom(0.8), 0.8)
  assert.equal(clampUserPhotoZoom(0.6), 0.6)
  assert.equal(clampUserPhotoZoom(1), 1)
  assert.equal(clampUserPhotoZoom(1.5), 1.5)
})

test('contain and cover each apply exactly one base fit scale', () => {
  const photo = { width: 2400, height: 1200 }
  const slot = { width: 600, height: 1200 }
  assert.equal(basePhotoFitScale(photo, slot, 'contain'), 0.25)
  assert.equal(basePhotoFitScale(photo, slot, 'cover'), 1)
})

test('invalid dimensions are rejected instead of producing an unsafe scale', () => {
  assert.throws(() => basePhotoFitScale({ width: 0, height: 100 }, { width: 100, height: 100 }, 'contain'))
})
