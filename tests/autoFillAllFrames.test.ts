import assert from 'node:assert/strict'
import test from 'node:test'
import { assignPhotosAcrossRoom, invalidateCompletedRoomFrames, resolveRoomTemplateDetails, roomHasAssignedPhotos, totalRoomSlotCount } from '../client/src/features/photos/autoFillAllFrames'
import { assignPhotoToTarget } from '../client/src/features/photos/directPhotoTarget'
import type { CustomerTemplate, CustomerTemplateSummary } from '../client/src/services/catalog/types'
import type { FilledSlot, PhotoAsset } from '../client/src/types/selfBooth'

const photo = (index: number): PhotoAsset => ({ id: `photo-${index}`, src: `blob:${index}`, alt: `Photo ${index}`, source: 'phone' })
const template = (id: string, count: number): CustomerTemplate => ({ id, name: id, roomId: 'room', printSize: '', width: 1200, height: 1800, backgroundUrl: '', elements: [], slots: Array.from({ length: count }, (_, index) => ({ id: `${id}-${index}`, x: 0, y: 0, width: 100, height: 100, rotation: 0, zIndex: index })) })
const summary = (id: string): CustomerTemplateSummary => ({ id, name: id, roomId: 'room', printSize: '', thumbnailUrl: '', displayOrder: 0 })
const existingSlot = (asset = photo(99)): FilledSlot => ({ photo: asset, transform: { zoom: 2, rotation: 5, x: 0.1, y: -0.2, flipX: false, flipY: false }, fit: 'cover', filter: 'none' })

test('total required count sums authoritative slots in Room frame order', () => {
  assert.equal(totalRoomSlotCount([template('one', 4), template('two', 4), template('three', 8)]), 16)
})

test('detail preparation loads only missing templates through ensureTemplateDetail', async () => {
  const summaries = [summary('one'), summary('two'), summary('three')]
  const cached = { one: template('one', 2) }
  const calls: string[] = []
  const details = await resolveRoomTemplateDetails(summaries, cached, async (id) => { calls.push(id); return template(id, 3) })
  assert.deepEqual(calls.sort(), ['three', 'two'])
  assert.deepEqual(details.map((item) => item.id), ['one', 'two', 'three'])
  assert.equal(totalRoomSlotCount(details), 8)
})

test('fully cached detail preparation performs no fetches', async () => {
  const summaries = [summary('one'), summary('two')]
  const cached = { one: template('one', 2), two: template('two', 2) }
  let calls = 0
  await resolveRoomTemplateDetails(summaries, cached, async () => { calls += 1; throw new Error('unexpected') })
  assert.equal(calls, 0)
})

test('sixteen photos fill sixteen slots exactly once with one stable shuffle', () => {
  const templates = [template('one', 4), template('two', 4), template('three', 4), template('four', 4)]
  const photos = Array.from({ length: 16 }, (_, index) => photo(index + 1))
  const result = assignPhotosAcrossRoom({}, templates, photos, false, () => 0)
  const assigned = templates.flatMap((item) => result[item.id]!.map((slot) => slot!.photo.id))
  assert.equal(assigned.length, 16)
  assert.equal(new Set(assigned).size, 16)
  assert.deepEqual([...assigned].sort(), photos.map((item) => item.id).sort())
  const afterNavigation = templates.flatMap((item) => result[item.id]!.map((slot) => slot!.photo.id))
  assert.deepEqual(afterNavigation, assigned)
})

test('insufficient photos and preparation failure preserve existing frame slots atomically', () => {
  const original = { one: [existingSlot()], two: [null, null] }
  assert.strictEqual(assignPhotosAcrossRoom(original, [template('one', 2), template('two', 2)], [photo(1), photo(2), photo(3)], false), original)
  assert.deepEqual(original.one?.[0]?.transform, existingSlot().transform)
})

test('Auto Fill detects overwrite risk and replaces every Room slot only after success', () => {
  const original = { one: [existingSlot()], outside: [existingSlot(photo(88))] }
  assert.equal(roomHasAssignedPhotos(original, ['one', 'two']), true)
  const result = assignPhotosAcrossRoom(original, [template('one', 1), template('two', 1)], [photo(1), photo(2)], false, () => 0.5)
  assert.notStrictEqual(result, original)
  assert.strictEqual(result.outside, original.outside)
  assert.notEqual(result.one?.[0]?.photo.id, 'photo-99')
})

test('All B&W uses the existing slot creation semantics', () => {
  const result = assignPhotosAcrossRoom({}, [template('one', 2)], [photo(1), photo(2)], true, () => 0.5)
  assert.deepEqual(result.one?.map((slot) => slot?.filter), ['grayscale', 'grayscale'])
  assert.deepEqual(result.one?.map((slot) => slot?.fit), ['contain', 'contain'])
})

test('Auto Fill invalidates only stale completion state for Room frames', () => {
  assert.deepEqual(invalidateCompletedRoomFrames(['one', 'outside', 'two'], ['one', 'two']), ['outside'])
})

test('standard Replace and Remove edits remain compatible after Auto Fill', () => {
  const filled = assignPhotosAcrossRoom({}, [template('one', 2)], [photo(1), photo(2)], false, () => 0.5)
  const replaced = assignPhotoToTarget(filled, { templateId: 'one', slotIndex: 0, slotCount: 2 }, photo(3))
  const removed = { ...replaced, one: replaced.one!.map((slot, index) => index === 1 ? null : slot) }
  assert.equal(removed.one?.[0]?.photo.id, 'photo-3')
  assert.equal(removed.one?.[1], null)
})
