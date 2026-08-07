import type { Room } from '../../models/Room'
import type { AdminTemplateRecord } from '../../features/admin/types'
export type { CustomerTemplate } from './types'

export const roomStorageKey = 'selfbooth.admin-rooms.v1'
export const templateStorageKey = 'selfbooth.admin-template-studio.v1'

const slugify = (value: string) => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'room'

function migrateRoom(value: unknown, index: number): Room | null {
  if (!value || typeof value !== 'object') return null
  const room = value as Record<string, unknown>
  if (typeof room.id !== 'string' || typeof room.name !== 'string') return null
  const enabled = typeof room.isActive === 'boolean' ? room.isActive : room.isEnabled !== false && room.isArchived !== true
  return {
    id: room.id,
    name: room.name,
    slug: typeof room.slug === 'string' ? room.slug : slugify(room.name),
    description: typeof room.description === 'string' ? room.description : '',
    cover: typeof room.cover === 'string' ? room.cover : typeof room.coverUrl === 'string' ? room.coverUrl : null,
    isActive: enabled,
    published: typeof room.published === 'boolean' ? room.published : enabled,
    sortOrder: typeof room.sortOrder === 'number' ? room.sortOrder : typeof room.displayOrder === 'number' ? room.displayOrder : index,
  }
}

/** Reads the old browser catalog only for the one-time Supabase import. */
export function readLegacyRooms(): Room[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(roomStorageKey) ?? '[]') as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.map(migrateRoom).filter((room): room is Room => Boolean(room)).sort((a, b) => a.sortOrder - b.sortOrder)
  } catch { return [] }
}

/** Reads the old browser templates only for the one-time Supabase import. */
export function readLegacyTemplates(): AdminTemplateRecord[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(templateStorageKey) ?? '[]') as unknown
    if (!Array.isArray(parsed)) return []
    return (parsed as Array<AdminTemplateRecord & { roomId?: string }>).filter((record) => Boolean(record?.id && record?.template)).map((record) => ({ ...record, roomId: record.roomId ?? 'room-default' }))
  } catch { return [] }
}

export function clearLegacyCatalog() {
  localStorage.removeItem(roomStorageKey)
  localStorage.removeItem(templateStorageKey)
}

const maximumCoverBytes = 350 * 1024
const maximumCoverEdge = 1280

const canvasBlob = (canvas: HTMLCanvasElement, quality: number) => new Promise<Blob>((resolve, reject) => {
  canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('The Room cover could not be encoded.')), 'image/webp', quality)
})

const blobDataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader()
  reader.onerror = () => reject(new Error('The Room cover could not be read.'))
  reader.onload = () => resolve(String(reader.result))
  reader.readAsDataURL(blob)
})

export async function prepareRoomCover(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file)
  try {
    const scale = Math.min(1, maximumCoverEdge / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('The Room cover could not be prepared.')
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    let quality = 0.86
    let blob = await canvasBlob(canvas, quality)
    while (blob.size > maximumCoverBytes && quality > 0.45) { quality -= 0.1; blob = await canvasBlob(canvas, quality) }
    return blobDataUrl(blob)
  } finally { bitmap.close() }
}
