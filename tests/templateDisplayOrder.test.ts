import assert from 'node:assert/strict'
import test from 'node:test'
import type { AdminTemplateSummary } from '../client/src/features/admin/types'
import { parseTemplatePosition, reorderTemplatesInRoom } from '../client/src/features/admin/model/templateOrder'

const template = (id: string, roomId: string, displayOrder: number): AdminTemplateSummary => ({
  id, roomId, displayOrder, name: id, status: 'published', thumbnailUrl: null,
  category: 'Test', slotCount: 1, updatedAt: '2026-01-01T00:00:00.000Z',
})
const room = (size: number, roomId = 'room-a') => Array.from({ length: size }, (_, index) => template(`${roomId}-${index + 1}`, roomId, index + 1))
const positions = (items: AdminTemplateSummary[], roomId = 'room-a') => items.filter((item) => item.roomId === roomId).sort((a, b) => a.displayOrder - b.displayOrder).map((item) => item.id)

test('moving position 14 to 1 shifts the room into contiguous positions', () => {
  const reordered = reorderTemplatesInRoom(room(14), 'room-a-14', 1)
  assert.deepEqual(positions(reordered), ['room-a-14', ...Array.from({ length: 13 }, (_, index) => `room-a-${index + 1}`)])
  assert.deepEqual(reordered.map((item) => item.displayOrder).sort((a, b) => a - b), Array.from({ length: 14 }, (_, index) => index + 1))
})

test('moving position 1 to 14 shifts the room into contiguous positions', () => {
  assert.deepEqual(positions(reorderTemplatesInRoom(room(14), 'room-a-1', 14)), [...Array.from({ length: 13 }, (_, index) => `room-a-${index + 2}`), 'room-a-1'])
})

test('moving position 5 to 2 affects only the target room', () => {
  const otherRoom = room(3, 'room-b')
  const reordered = reorderTemplatesInRoom([...room(6), ...otherRoom], 'room-a-5', 2)
  assert.deepEqual(positions(reordered), ['room-a-1', 'room-a-5', 'room-a-2', 'room-a-3', 'room-a-4', 'room-a-6'])
  assert.deepEqual(reordered.filter((item) => item.roomId === 'room-b'), otherRoom)
})

test('position validation rejects zero, negatives, decimals, and empty values and clamps oversized values', () => {
  for (const value of ['0', '-1', '1.5', '', '  ']) assert.equal(parseTemplatePosition(value, 14), null)
  assert.equal(parseTemplatePosition('999', 14), 14)
  assert.equal(parseTemplatePosition('2', 14), 2)
})
