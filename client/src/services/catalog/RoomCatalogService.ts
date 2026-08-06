import { printTemplates } from '../../data/templates'
import { defaultRoom } from '../../models/Room'
import type { Room } from '../../models/Room'
import type { PrintTemplate } from '../../types/selfBooth'

export const roomStorageKey = 'selfbooth.admin-rooms.v1'
export const templateStorageKey = 'selfbooth.admin-template-studio.v1'

export interface CustomerTemplate extends PrintTemplate {
  roomId: string
  printSize: string
}

interface StoredTemplateRecord {
  roomId?: string
  status?: string
  info?: { printSize?: string }
  template?: PrintTemplate
}

const slugify = (value: string) => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'room'

function migrateRoom(value: unknown, index: number): Room | null {
  if (!value || typeof value !== 'object') return null
  const room = value as Record<string, unknown>
  if (typeof room.id !== 'string' || typeof room.name !== 'string') return null
  return {
    id: room.id,
    name: room.name,
    slug: typeof room.slug === 'string' ? room.slug : slugify(room.name),
    description: typeof room.description === 'string' ? room.description : '',
    cover: typeof room.cover === 'string' ? room.cover : typeof room.coverUrl === 'string' ? room.coverUrl : null,
    isActive: typeof room.isActive === 'boolean' ? room.isActive : room.isEnabled !== false && room.isArchived !== true,
    sortOrder: typeof room.sortOrder === 'number' ? room.sortOrder : typeof room.displayOrder === 'number' ? room.displayOrder : index,
  }
}

export function readRooms(): Room[] {
  try {
    const raw = localStorage.getItem(roomStorageKey)
    if (!raw) return [defaultRoom]
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return [defaultRoom]
    const rooms = parsed.map(migrateRoom).filter((room): room is Room => Boolean(room))
    return (rooms.length ? rooms : [defaultRoom]).sort((a, b) => a.sortOrder - b.sortOrder)
  } catch { return [defaultRoom] }
}

export function writeRooms(rooms: Room[]) {
  localStorage.setItem(roomStorageKey, JSON.stringify(rooms))
}

export function readCustomerTemplates(): CustomerTemplate[] {
  try {
    const raw = localStorage.getItem(templateStorageKey)
    if (raw) {
      const records = JSON.parse(raw) as StoredTemplateRecord[]
      if (Array.isArray(records)) return records.filter((record) => record.status === 'published' && record.template).map((record) => ({ ...record.template!, roomId: record.roomId ?? defaultRoom.id, printSize: record.info?.printSize ?? '4 × 6 in' }))
    }
  } catch { /* Fall back to packaged templates. */ }
  return printTemplates.map((template) => ({ ...template, roomId: defaultRoom.id, printSize: '4 × 6 in' }))
}
