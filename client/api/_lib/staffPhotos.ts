import type { SupabaseClient } from '@supabase/supabase-js'
import { UploadApiError } from './http.js'
import { customerPhotoBucket } from './supabaseStorage.js'
import { normalizeVietnamesePhone } from './uploadValidation.js'

const phonePattern = /^0(?:3|5|7|8|9)\d{8}$/
const imagePattern = /\.(?:png|jpe?g)$/i

export function requireCustomerPhone(value: unknown) {
  const phone = normalizeVietnamesePhone(String(value ?? ''))
  if (!phonePattern.test(phone)) throw new UploadApiError(400, 'Vui lòng nhập đúng số điện thoại Việt Nam.')
  return phone
}

export function requireCustomerObjectPath(phone: string, value: unknown) {
  const path = String(value ?? '')
  if (!path.startsWith(`${phone}/`) || path.slice(phone.length + 1).includes('/') || !/\.(?:png|jpe?g)$/i.test(path)) throw new UploadApiError(400, 'Đường dẫn ảnh không hợp lệ.')
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

export async function listCustomerFolders(client: SupabaseClient, search: string, offset = 0, limit = 24) {
  const result = await client.storage.from(customerPhotoBucket).list('', { limit: limit + 1, offset, search: search || undefined, sortBy: { column: 'name', order: 'asc' } })
  if (result.error) throw new UploadApiError(502, 'Không thể tải danh sách thư mục khách hàng.')
  const candidates = result.data.slice(0, limit).filter((entry) => phonePattern.test(entry.name))
  const folders: Awaited<ReturnType<typeof summarizeCustomerFolder>>[] = []
  for (let index = 0; index < candidates.length; index += 6) {
    folders.push(...await Promise.all(candidates.slice(index, index + 6).map((entry) => summarizeCustomerFolder(client, entry.name))))
  }
  folders.sort((left, right) => (Date.parse(right.latestUploadAt ?? '') || 0) - (Date.parse(left.latestUploadAt ?? '') || 0) || left.phone.localeCompare(right.phone))
  return { items: folders, hasMore: result.data.length > limit, nextOffset: offset + Math.min(result.data.length, limit) }
}

export async function listCustomerPhotos(client: SupabaseClient, phone: string, offset = 0, limit = 40) {
  const result = await client.storage.from(customerPhotoBucket).list(phone, { limit, offset, sortBy: { column: 'created_at', order: 'desc' } })
  if (result.error) throw new UploadApiError(502, 'Không thể tải danh sách ảnh.')
  const files = result.data.filter((file) => file.id && imagePattern.test(file.name))
  const signed = await Promise.all(files.map(async (file) => {
    const path = `${phone}/${file.name}`
    const preview = await client.storage.from(customerPhotoBucket).createSignedUrl(path, 300, { transform: { width: 360, height: 360, resize: 'contain', quality: 70 } })
    return { path, name: originalFilename(file.name), size: Number(file.metadata?.size ?? 0), uploadedAt: file.created_at, previewUrl: preview.data?.signedUrl ?? null }
  }))
  return { items: signed, hasMore: result.data.length === limit }
}
