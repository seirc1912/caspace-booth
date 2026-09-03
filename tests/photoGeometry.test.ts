import assert from 'node:assert/strict'
import test from 'node:test'
import { constrainCoverTransform, coverSize, minimumCoverZoom } from '../client/src/features/photos/photoGeometry'

const transform = { zoom: 1, rotation: 0, x: 0, y: 0, flipX: false, flipY: false }

test('cover sizing preserves portrait, landscape, and square aspect ratios', () => {
  assert.deepEqual(coverSize({ width: 1000, height: 2000 }, { width: 1200, height: 600 }), { width: 1200, height: 2400 })
  assert.deepEqual(coverSize({ width: 2000, height: 1000 }, { width: 600, height: 1200 }), { width: 2400, height: 1200 })
  assert.deepEqual(coverSize({ width: 1000, height: 1000 }, { width: 500, height: 500 }), { width: 500, height: 500 })
})

test('zoom cannot fall below the calculated cover minimum', () => {
  const photo = { width: 2000, height: 1000 }; const slot = { width: 600, height: 1200 }
  assert.equal(minimumCoverZoom(photo, slot), 1)
  assert.equal(constrainCoverTransform({ ...transform, zoom: 0.25 }, photo, slot).zoom, 1)
})

test('horizontal drag clamps while the non-excess axis stays centered', () => {
  assert.deepEqual(constrainCoverTransform({ ...transform, x: 10, y: 10 }, { width: 2000, height: 1000 }, { width: 500, height: 500 }), { ...transform, x: 0.5 })
})

test('vertical drag clamps while the non-excess axis stays centered', () => {
  assert.deepEqual(constrainCoverTransform({ ...transform, x: 10, y: 10 }, { width: 1000, height: 2000 }, { width: 500, height: 500 }), { ...transform, y: 0.5 })
})

test('both axes clamp after zooming in', () => {
  assert.deepEqual(constrainCoverTransform({ ...transform, zoom: 2, x: 10, y: -10 }, { width: 1000, height: 1000 }, { width: 500, height: 500 }), { ...transform, zoom: 2, x: 0.5, y: -0.5 })
})

test('reset values are centered cover at minimum zoom', () => {
  assert.deepEqual(constrainCoverTransform(transform, { width: 1000, height: 2000 }, { width: 1200, height: 600 }), transform)
})
