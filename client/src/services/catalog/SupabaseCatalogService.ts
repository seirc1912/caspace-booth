import { createClient } from '@supabase/supabase-js'
import type { Room } from '../../models/Room'
import type { AdminTemplateRecord, AdminTemplateSummary } from '../../features/admin/types'
import type { CustomerTemplate, CustomerTemplateSummary } from './types'
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

interface TemplateSummaryRow {
  id: string; room_id: string; name: string; thumbnail: string | null; enabled: boolean
  status: string | null; category: string | null; slot_count: number; display_order: number; updated_at: string
}

interface PublishedTemplateSummaryRow {
  id: string; room_id: string; name: string; thumbnail: string | null
  print_size: string | null; slot_count: number; display_order: number
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

const toTemplateSummary = (row: TemplateSummaryRow): AdminTemplateSummary => ({
  id: row.id, roomId: row.room_id, name: row.name,
  status: row.status === 'archived' ? 'archived' : row.enabled ? 'published' : 'draft',
  thumbnailUrl: row.thumbnail, category: row.category ?? 'Custom', slotCount: row.slot_count ?? 0,
  displayOrder: row.display_order, updatedAt: row.updated_at,
})

export async function loadAdminTemplateSummaries() {
  const { data, error } = await supabase.rpc('admin_templates_summary', { p_token: requireToken() })
  return unwrap(data as TemplateSummaryRow[] | null, error).map(toTemplateSummary)
}

export async function loadAdminTemplateDetail(id: string) {
  const { data, error } = await supabase.rpc('admin_template_detail', { p_token: requireToken(), p_id: id })
  return toAdminTemplate(unwrap(data as TemplateRow | null, error))
}

export async function saveAdminTemplate(record: AdminTemplateRecord, displayOrder: number) {
  const storageRecord = await uploadEmbeddedTemplateAssets(record)
  const { data, error } = await supabase.rpc('admin_upsert_template', { p_token: requireToken(), p_template: templatePayload(storageRecord, displayOrder) })
  return toAdminTemplate(unwrap(data as TemplateRow | null, error))
}

const dataUrlPattern = /^data:(image\/[a-z0-9.+-]+);base64,/i
const templateAssetBucket = 'template-assets'

async function dataUrlToBlob(value: string) {
  const response = await fetch(value)
  if (!response.ok) throw new Error('Template asset could not be decoded.')
  return response.blob()
}

const assetExtension = (mime: string) => mime === 'image/svg+xml' ? 'svg' : mime.split('/')[1]?.replace('jpeg', 'jpg') ?? 'bin'

async function uploadDataUrl(templateId: string, field: string, value: string) {
  if (!dataUrlPattern.test(value)) return value
  const blob = await dataUrlToBlob(value)
  const path = `${templateId}/${field}-${crypto.randomUUID()}.${assetExtension(blob.type)}`
  const token = requireToken()
  const { error } = await supabase.storage.from(templateAssetBucket).upload(path, blob, {
    contentType: blob.type, upsert: false, metadata: { adminToken: token },
  })
  if (error) throw new Error(`Template asset upload failed: ${error.message}`)
  return supabase.storage.from(templateAssetBucket).getPublicUrl(path).data.publicUrl
}

/** Uploads only embedded image fields and leaves the input record untouched if any upload fails. */
export async function uploadEmbeddedTemplateAssets(record: AdminTemplateRecord): Promise<AdminTemplateRecord> {
  const next = structuredClone(record)
  if (next.coverUrl) next.coverUrl = await uploadDataUrl(record.id, 'cover', next.coverUrl)
  if (next.template.backgroundUrl) next.template.backgroundUrl = await uploadDataUrl(record.id, 'background', next.template.backgroundUrl)
  if (next.template.thumbnailUrl) next.template.thumbnailUrl = await uploadDataUrl(record.id, 'thumbnail', next.template.thumbnailUrl)
  for (const element of next.template.elements) {
    if (element.assetUrl) element.assetUrl = await uploadDataUrl(record.id, `element-${element.id}`, element.assetUrl)
  }
  return next
}

export async function uploadTemplateAsset(templateId: string, field: string, file: File) {
  if (!file.type.startsWith('image/')) throw new Error('Only image assets are supported.')
  const path = `${templateId}/${field}-${crypto.randomUUID()}.${assetExtension(file.type)}`
  const { error } = await supabase.storage.from(templateAssetBucket).upload(path, file, {
    contentType: file.type, upsert: false, metadata: { adminToken: requireToken() },
  })
  if (error) throw new Error(`Template asset upload failed: ${error.message}`)
  return supabase.storage.from(templateAssetBucket).getPublicUrl(path).data.publicUrl
}

export async function deleteAdminTemplate(id: string) {
  const { error } = await supabase.rpc('admin_delete_template', { p_token: requireToken(), p_id: id })
  if (error) throw new Error(error.message)
}

export async function loadPublishedRooms(): Promise<Room[]> {
  const { data, error } = await supabase.rpc('published_rooms')
  return unwrap(data as RoomRow[] | null, error).map(toRoom)
}

let publishedTemplateSummariesRequest: Promise<CustomerTemplateSummary[]> | null = null
export function loadPublishedTemplateSummaries(): Promise<CustomerTemplateSummary[]> {
  publishedTemplateSummariesRequest ??= (async () => {
    const { data, error } = await supabase.rpc('published_templates_summary')
    return unwrap(data as PublishedTemplateSummaryRow[] | null, error).map((row) => ({
      id: row.id, roomId: row.room_id, name: row.name, thumbnailUrl: row.thumbnail,
      printSize: row.print_size ?? '', slotCount: row.slot_count ?? 0, displayOrder: row.display_order,
    }))
  })().catch((reason: unknown) => {
    publishedTemplateSummariesRequest = null
    throw reason
  })
  return publishedTemplateSummariesRequest
}

const publishedTemplateCache = new Map<string, Promise<CustomerTemplate>>()

export function loadPublishedTemplateDetail(id: string): Promise<CustomerTemplate> {
  const cached = publishedTemplateCache.get(id)
  if (cached) return cached
  const request = (async () => {
    const { data, error } = await supabase.rpc('published_template_detail', { p_id: id })
    const record = toAdminTemplate(unwrap(data as TemplateRow | null, error))
    return { ...record.template, roomId: record.roomId, printSize: record.info.printSize }
  })().catch((reason: unknown) => {
    publishedTemplateCache.delete(id)
    throw reason
  })
  publishedTemplateCache.set(id, request)
  return request
}

export { templatePayload }
