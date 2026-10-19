import { createClient } from '@supabase/supabase-js'
import { header, type ApiRequest, UploadApiError } from './http.js'
import { loadSupabaseStorageEnvironment } from './supabaseStorage.js'

export function parseStaffAllowlist(value: string | undefined) {
  return new Set((value ?? '').split(',').map((email) => email.trim().toLowerCase()).filter(Boolean))
}

export async function requireStaff(request: ApiRequest) {
  const authorization = header(request, 'authorization')
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]
  if (!token) throw new UploadApiError(401, 'Phiên đăng nhập không hợp lệ.')
  const environment = loadSupabaseStorageEnvironment()
  const client = createClient(environment.url, environment.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await client.auth.getUser(token)
  if (error || !data.user?.email) throw new UploadApiError(401, 'Phiên đăng nhập đã hết hạn.')
  const allowlist = parseStaffAllowlist(process.env.STAFF_PHOTO_EMAIL_ALLOWLIST)
  if (!allowlist.size) throw new UploadApiError(503, 'Danh sách nhân viên chưa được cấu hình.')
  if (!allowlist.has(data.user.email.toLowerCase())) throw new UploadApiError(403, 'Tài khoản này không có quyền xem ảnh khách.')
  return { email: data.user.email, client, environment }
}
