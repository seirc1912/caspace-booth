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
  try {
    localStorage.setItem(roomStorageKey, JSON.stringify(rooms))
  } catch (error) {
    if (!(error instanceof DOMException) || (error.name !== 'QuotaExceededError' && error.name !== 'NS_ERROR_DOM_QUOTA_REACHED')) throw error

    // A cover is presentation data; never let a large data URL prevent the
    // Room catalog itself from being persisted. Remove the largest covers one
    // at a time until the complete Room array fits.
    const compactRooms = rooms.map((room) => ({ ...room }))
    const coversBySize = compactRooms
      .filter((room) => room.cover?.startsWith('data:'))
      .sort((left, right) => (right.cover?.length ?? 0) - (left.cover?.length ?? 0))

    for (const room of coversBySize) {
      room.cover = null
      try {
        localStorage.setItem(roomStorageKey, JSON.stringify(compactRooms))
        console.warn(`Room cover omitted from local persistence because browser storage is full: ${room.id}`)
        return
      } catch (retryError) {
        if (!(retryError instanceof DOMException) || (retryError.name !== 'QuotaExceededError' && retryError.name !== 'NS_ERROR_DOM_QUOTA_REACHED')) throw retryError
      }
    }

    throw error
  }
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

/** Normalizes Room covers before they enter the localStorage-backed catalog. */
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
    while (blob.size > maximumCoverBytes && quality > 0.45) {
      quality -= 0.1
      blob = await canvasBlob(canvas, quality)
    }
    return blobDataUrl(blob)
  } finally {
    bitmap.close()
  }
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
