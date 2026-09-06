import assert from 'node:assert/strict'
import test from 'node:test'
import { assignPhotoToTarget } from '../client/src/features/photos/directPhotoTarget'
import type { FilledSlot, PhotoAsset } from '../client/src/types/selfBooth'

const photo = (id: string): PhotoAsset => ({ id, src: `blob:${id}`, alt: id, source: 'phone' })
const filled = (id: string, zoom = 1): FilledSlot => ({
  photo: photo(id),
  fit: 'contain',
  transform: { zoom, rotation: 0, x: 0, y: 0, flipX: false, flipY: false },
})

test('direct selection assigns only the captured frame and slot', () => {
  const frameOne = [filled('existing', 0.8), null]
  const frameTwo = [null, null, null]
  const current = { 'frame-1': frameOne, 'frame-2': frameTwo }

  const next = assignPhotoToTarget(current, { templateId: 'frame-2', slotIndex: 1, slotCount: 3 }, photo('selected'))

  assert.equal(next['frame-1'], frameOne)
  assert.equal(next['frame-2']?.[0], null)
  assert.equal(next['frame-2']?.[2], null)
  assert.equal(next['frame-2']?.[1]?.photo.id, 'selected')
})

test('replacement receives a fresh centered 100% contain transform', () => {
  const next = assignPhotoToTarget(
    { frame: [filled('old', 1.75)] },
    { templateId: 'frame', slotIndex: 0, slotCount: 1 },
    photo('replacement'),
  )

  assert.deepEqual(next.frame?.[0], {
    photo: photo('replacement'),
    fit: 'contain',
    filter: 'none',
    transform: { zoom: 1, rotation: 0, x: 0, y: 0, flipX: false, flipY: false },
  })
})

test('a captured target initializes its own frame without touching other frames', () => {
  const existing = { 'frame-1': [filled('kept')] }
  const next = assignPhotoToTarget(existing, { templateId: 'frame-4', slotIndex: 2, slotCount: 4 }, photo('new'))

  assert.equal(next['frame-1'], existing['frame-1'])
  assert.equal(next['frame-4']?.length, 4)
  assert.equal(next['frame-4']?.[2]?.photo.id, 'new')
})

test('an invalid or missing picker target leaves the editor unchanged', () => {
  const current = { frame: [null] }
  assert.equal(assignPhotoToTarget(current, { templateId: '', slotIndex: 0, slotCount: 1 }, photo('ignored')), current)
  assert.equal(assignPhotoToTarget(current, { templateId: 'frame', slotIndex: 1, slotCount: 1 }, photo('ignored')), current)
})
