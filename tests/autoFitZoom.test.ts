import assert from 'node:assert/strict'
import test from 'node:test'
import { autoFitZoom, createAutoFitZoomUpdate } from '../client/src/features/photos/autoFitZoom'
import type { FilledSlot, PhotoAsset } from '../client/src/types/selfBooth'

const photo: PhotoAsset = { id: 'photo-1', src: 'blob:photo-1', blob: new Blob(['original-photo']) }
const slot: FilledSlot = {
  photo,
  transform: { zoom: 1.5, x: 25, y: -10, rotation: 3, flipX: true, flipY: false },
  fit: 'contain',
  filter: 'grayscale',
}

test('Auto Fit cycles 150% to 230% to 102% to 150%', () => {
  assert.deepEqual(createAutoFitZoomUpdate(1.5), { zoom: 2.3 })
  assert.deepEqual(createAutoFitZoomUpdate(2.3), { zoom: 1.02 })
  assert.deepEqual(createAutoFitZoomUpdate(1.02), { zoom: 1.5 })
  assert.deepEqual(createAutoFitZoomUpdate(1.5), { zoom: 2.3 })
})

test('Auto Fit recognizes approximate presets and starts manual zooms at 230%', () => {
  assert.deepEqual(createAutoFitZoomUpdate(2.3005), { zoom: 1.02 })
  assert.deepEqual(createAutoFitZoomUpdate(1.0205), { zoom: 1.5 })
  assert.deepEqual(createAutoFitZoomUpdate(1.8), { zoom: 2.3 })
})

test('Auto Fit returns a zoom-only transform patch', () => {
  const update = createAutoFitZoomUpdate(slot.transform.zoom)
  const updated = { ...slot, transform: { ...slot.transform, ...update } }

  assert.deepEqual(Object.keys(update), ['zoom'])
  assert.equal(updated.transform.zoom, autoFitZoom.close)
  assert.deepEqual({ ...updated, transform: { ...updated.transform, zoom: slot.transform.zoom } }, slot)
  assert.strictEqual(updated.photo, photo)
  assert.strictEqual(updated.photo.blob, photo.blob)
  assert.equal(updated.filter, 'grayscale')
  assert.equal(updated.fit, 'contain')
})

test('Auto Fit presets do not constrain the existing manual zoom range', () => {
  const manuallyZoomedOut = { ...slot, transform: { ...slot.transform, zoom: 0.8 } }
  const manuallyZoomedIn = { ...slot, transform: { ...slot.transform, zoom: 2.5 } }

  assert.equal(manuallyZoomedOut.transform.zoom, 0.8)
  assert.equal(manuallyZoomedIn.transform.zoom, 2.5)
})
