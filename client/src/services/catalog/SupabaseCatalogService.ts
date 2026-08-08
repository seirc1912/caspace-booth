import { createClient } from '@supabase/supabase-js'
import type { Room } from '../../models/Room'
import type { AdminTemplateRecord } from '../../features/admin/types'
import type { CustomerTemplate } from './types'
import { printTemplates } from '../../data/templates'

const projectUrl = import.meta.env.VITE_SUPABASE_URL?.trim() || 'https://jmxhlueibhpltxrwqdpf.supabase.co'
if (!projectUrl.startsWith('https://')) throw new Error('VITE_SUPABASE_URL must use HTTPS.')
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() || 'sb_publishable_iQy5i_H_MAEGASo-sP-fWQ_7RYXa6rY'
const adminSessionKey = 'selfbooth.admin-session.v1'

export const supabase = createClient(projectUrl, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } })

interface RoomRow {
  id: string; name: string; slug: string; description: string; cover_image: string | null
  enabled: boolean; published: boolean; display_order: number
}

interface TemplateRow {
  id: string; room_id: string; name: string; thumbnail: string | null; editor_data: unknown
  enabled: boolean; display_order: number; updated_at: string
}

const unwrap = <T>(data: T | null, error: { message: string } | null): T => {
  if (error) throw new Error(error.message)
  if (data === null) throw new Error('Supabase returned no catalog data.')
  return data
}

const toRoom = (row: RoomRow): Room => ({
  id: row.id, name: row.name, slug: row.slug, description: row.description, cover: row.cover_image,
  isActive: row.enabled, published: row.published, sortOrder: row.display_order,
})

const roomPayload = (room: Room) => ({
  id: room.id, name: room.name, slug: room.slug, description: room.description, cover_image: room.cover,
  enabled: room.isActive, published: room.published, display_order: room.sortOrder,
})

const isViteFilesystemAsset = (url: string | null | undefined) => typeof url === 'string' && url.startsWith('/@fs/')

const toAdminTemplate = (row: TemplateRow): AdminTemplateRecord => {
  const record = row.editor_data as AdminTemplateRecord
  const bundled = printTemplates.find((template) => template.id === row.id)
  const backgroundUrl = isViteFilesystemAsset(record.template.backgroundUrl) ? bundled?.backgroundUrl ?? null : record.template.backgroundUrl
  const thumbnailUrl = isViteFilesystemAsset(record.template.thumbnailUrl) ? bundled?.thumbnailUrl ?? null : record.template.thumbnailUrl
  const coverUrl = isViteFilesystemAsset(row.thumbnail) ? bundled?.thumbnailUrl ?? null : row.thumbnail
  return { ...record, id: row.id, roomId: row.room_id, status: record.status ?? (row.enabled ? 'published' : 'draft'), coverUrl, updatedAt: row.updated_at, template: { ...record.template, id: row.id, name: row.name, backgroundUrl, thumbnailUrl } }
}

const templatePayload = (record: AdminTemplateRecord, displayOrder: number) => ({
  id: record.id, room_id: record.roomId, name: record.template.name,
  thumbnail: record.coverUrl ?? record.template.thumbnailUrl, editor_data: record,
  enabled: record.status === 'published', display_order: displayOrder,
})

export const getAdminToken = () => sessionStorage.getItem(adminSessionKey)
export const clearAdminToken = () => sessionStorage.removeItem(adminSessionKey)

export async function adminLogin(username: string, password: string) {
  const { data, error } = await supabase.rpc('admin_login', { p_username: username, p_password: password })
  if (error || typeof data !== 'string') return false
  sessionStorage.setItem(adminSessionKey, data)
  return true
}

const requireToken = () => {
  const token = getAdminToken()
  if (!token) throw new Error('Admin session expired. Please sign in again.')
  return token
}

export async function loadAdminRooms() {
  const { data, error } = await supabase.rpc('admin_rooms', { p_token: requireToken() })
  return unwrap(data as RoomRow[] | null, error).map(toRoom)
}

export async function saveAdminRoom(room: Room) {
  const { data, error } = await supabase.rpc('admin_upsert_room', { p_token: requireToken(), p_room: roomPayload(room) })
  return toRoom(unwrap(data as RoomRow | null, error))
}

export async function deleteAdminRoom(id: string) {
  const { error } = await supabase.rpc('admin_delete_room', { p_token: requireToken(), p_id: id })
  if (error) throw new Error(error.message)
}

export async function loadAdminTemplates() {
  const { data, error } = await supabase.rpc('admin_templates', { p_token: requireToken() })
  return unwrap(data as TemplateRow[] | null, error).map(toAdminTemplate)
}

export async function saveAdminTemplate(record: AdminTemplateRecord, displayOrder: number) {
  const { data, error } = await supabase.rpc('admin_upsert_template', { p_token: requireToken(), p_template: templatePayload(record, displayOrder) })
  return toAdminTemplate(unwrap(data as TemplateRow | null, error))
}

export async function deleteAdminTemplate(id: string) {
  const { error } = await supabase.rpc('admin_delete_template', { p_token: requireToken(), p_id: id })
  if (error) throw new Error(error.message)
}

export async function loadPublishedCatalog(): Promise<{ rooms: Room[]; templates: CustomerTemplate[] }> {
  const [roomResult, templateResult] = await Promise.all([supabase.rpc('published_rooms'), supabase.rpc('published_templates')])
  const rooms = unwrap(roomResult.data as RoomRow[] | null, roomResult.error).map(toRoom)
  const templates = unwrap(templateResult.data as TemplateRow[] | null, templateResult.error).map((row) => {
    const record = toAdminTemplate(row)
    return { ...record.template, roomId: record.roomId, printSize: record.info.printSize }
  })
  return { rooms, templates }
}

export { templatePayload }
