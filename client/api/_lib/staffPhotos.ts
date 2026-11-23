import type { SupabaseClient } from '@supabase/supabase-js'
import { UploadApiError } from './http.js'
import { BOOTH_FOLDER, boothThumbnailPath } from './boothPaths.js'
import { customerPhotoBucket, thumbnailPathFor } from './supabaseStorage.js'
import { normalizeVietnamesePhone } from './uploadValidation.js'

const phonePattern = /^0(?:3|5|7|8|9)\d{8}$/
const imagePattern = /\.(?:png|jpe?g)$/i

export function requireCustomerPhone(value: unknown) {
  const phone = normalizeVietnamesePhone(String(value ?? ''))
  if (!phonePattern.test(phone)) throw new UploadApiError(400, 'Vui lòng nhập đúng số điện thoại Việt Nam.')
  return phone
}

/** Staff see two kinds of photos per customer: frames the customer sent, and booth originals. */
export type PhotoSource = 'frames' | 'booth'

export function parsePhotoSource(value: unknown): PhotoSource {
  return value === 'booth' ? 'booth' : 'frames'
}

export function requireCustomerObjectPath(phone: string, value: unknown) {
  const path = String(value ?? '')
  const rest = path.startsWith(`${phone}/${BOOTH_FOLDER}/`) ? path.slice(phone.length + BOOTH_FOLDER.length + 2) : path.startsWith(`${phone}/`) ? path.slice(phone.length + 1) : null
  if (rest === null || !rest || rest.includes('/') || rest.startsWith('.') || !/\.(?:png|jpe?g)$/i.test(rest)) throw new UploadApiError(400, 'Đường dẫn ảnh không hợp lệ.')
  return path
}

export function originalFilename(name: string) {
  return name.replace(/--[a-zA-Z0-9_-]{8,120}(\.[^.]+)$/u, '$1')
}

export function normalizeFolderSearch(value: unknown) {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  if (!/^[+\d\s().-]+$/.test(raw)) throw new UploadApiError(400, 'Từ khóa số điện thoại không hợp lệ.')
  const digits = raw.replace(/\D/g, '')
  const normalized = digits.startsWith('84') ? `0${digits.slice(2)}` : digits
  if (normalized.length > 10) throw new UploadApiError(400, 'Từ khóa số điện thoại không hợp lệ.')
  return normalized
}

async function summarizeCustomerFolder(client: SupabaseClient, phone: string) {
  let offset = 0
  let photoCount = 0
  let latestUploadAt: string | null = null
  while (offset < 10_000) {
    const result = await client.storage.from(customerPhotoBucket).list(phone, { limit: 1_000, offset, sortBy: { column: 'created_at', order: 'desc' } })
    if (result.error) throw new UploadApiError(502, 'Không thể tải thông tin thư mục ảnh.')
    const images = result.data.filter((file) => file.id && imagePattern.test(file.name))
    photoCount += images.length
    if (!latestUploadAt) latestUploadAt = images.find((file) => file.created_at)?.created_at ?? null
    offset += result.data.length
    if (result.data.length < 1_000) return { phone, photoCount, latestUploadAt, countCapped: false }
  }
  return { phone, photoCount, latestUploadAt, countCapped: true }
}

async function listAllCustomerFolderNames(client: SupabaseClient, search: string) {
  const phones: string[] = []
  let offset = 0
  const pageSize = 1_000
  while (offset < 100_000) {
    const result = await client.storage.from(customerPhotoBucket).list('', { limit: pageSize, offset, search: search || undefined, sortBy: { column: 'name', order: 'asc' } })
    if (result.error) throw new UploadApiError(502, 'Không thể tải danh sách thư mục khách hàng.')
    phones.push(...result.data.map((entry) => entry.name).filter((name) => phonePattern.test(name)))
    offset += result.data.length
    if (result.data.length < pageSize) return phones
  }
  throw new UploadApiError(503, 'Danh sách thư mục quá lớn để tải an toàn.')
}

export async function listCustomerFolders(client: SupabaseClient, search: string, offset = 0, limit = 24) {
  const candidates = await listAllCustomerFolderNames(client, search)
  const folders: Awaited<ReturnType<typeof summarizeCustomerFolder>>[] = []
  for (let index = 0; index < candidates.length; index += 12) {
    folders.push(...await Promise.all(candidates.slice(index, index + 12).map((phone) => summarizeCustomerFolder(client, phone))))
  }
  folders.sort((left, right) => (Date.parse(right.latestUploadAt ?? '') || 0) - (Date.parse(left.latestUploadAt ?? '') || 0) || left.phone.localeCompare(right.phone))
  const items = folders.slice(offset, offset + limit)
  return { items, hasMore: offset + items.length < folders.length, nextOffset: offset + items.length }
}

// Previews use pre-generated thumbnails (`_thumbs/`) through plain signed URLs.
// No Supabase Image Transformations are requested (quota: 100 origin images/month on Pro).
// Older photos without a thumbnail get previewUrl = null and the page shows a placeholder;
// originalUrl opens the untransformed original only when staff click it.
export async function listCustomerPhotos(client: SupabaseClient, phone: string, offset = 0, limit = 40, options: { signUrls?: boolean; source?: PhotoSource } = {}) {
  const booth = options.source === 'booth'
  const prefix = booth ? `${phone}/${BOOTH_FOLDER}` : phone
  // Booth originals in shooting order (Capture One counter); frames newest first.
  const result = await client.storage.from(customerPhotoBucket).list(prefix, { limit, offset, sortBy: booth ? { column: 'name', order: 'asc' } : { column: 'created_at', order: 'desc' } })
  if (result.error) throw new UploadApiError(502, 'Không thể tải danh sách ảnh.')
  const files = result.data.filter((file) => file.id && imagePattern.test(file.name))
  const items = files.map((file) => ({ path: `${prefix}/${file.name}`, name: booth ? file.name : originalFilename(file.name), size: Number(file.metadata?.size ?? 0), uploadedAt: file.created_at, previewUrl: null as string | null, originalUrl: null as string | null }))
  if (options.signUrls === false || !items.length) return { items, hasMore: result.data.length === limit }
  const bucket = client.storage.from(customerPhotoBucket)
  const [thumbs, originals] = await Promise.all([
    bucket.createSignedUrls(items.map((item) => (booth ? boothThumbnailPath(item.path) : thumbnailPathFor(item.path))), 300),
    bucket.createSignedUrls(items.map((item) => item.path), 300),
  ])
  // A missing thumbnail comes back as a per-path error, not a failed call.
  items.forEach((item, index) => {
    const thumb = thumbs.data?.[index]
    const original = originals.data?.[index]
    item.previewUrl = thumb && !thumb.error && thumb.signedUrl ? thumb.signedUrl : null
    item.originalUrl = original && !original.error && original.signedUrl ? original.signedUrl : null
  })
  return { items, hasMore: result.data.length === limit }
}
