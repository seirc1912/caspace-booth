import type { SupabaseClient } from '@supabase/supabase-js'
import { UploadApiError } from './http.js'
import { customerPhotoBucket } from './supabaseStorage.js'
import { normalizeVietnamesePhone } from './uploadValidation.js'

const phonePattern = /^0(?:3|5|7|8|9)\d{8}$/

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

export async function listCustomerPhotos(client: SupabaseClient, phone: string, offset = 0, limit = 40) {
  const result = await client.storage.from(customerPhotoBucket).list(phone, { limit, offset, sortBy: { column: 'created_at', order: 'desc' } })
  if (result.error) throw new UploadApiError(502, 'Không thể tải danh sách ảnh.')
  const files = result.data.filter((file) => file.id && /\.(?:png|jpe?g)$/i.test(file.name))
  const signed = await Promise.all(files.map(async (file) => {
    const path = `${phone}/${file.name}`
    const preview = await client.storage.from(customerPhotoBucket).createSignedUrl(path, 300, { transform: { width: 360, height: 360, resize: 'contain', quality: 70 } })
    return { path, name: originalFilename(file.name), size: Number(file.metadata?.size ?? 0), uploadedAt: file.created_at, previewUrl: preview.data?.signedUrl ?? null }
  }))
  return { items: signed, hasMore: result.data.length === limit }
}
