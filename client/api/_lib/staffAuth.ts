import { createClient } from '@supabase/supabase-js'
import { header, type ApiRequest, UploadApiError } from './http.js'
import { loadSupabaseStorageEnvironment } from './supabaseStorage.js'

export const STAFF_PUBLIC_USERNAME = 'caspace_staff'
export const STAFF_SESSION_COOKIE = '__Host-caspace_staff_session'

export function loadStaffIdentityEnvironment() {
  const email = process.env.STAFF_PHOTO_AUTH_EMAIL?.trim().toLowerCase()
  const userId = process.env.STAFF_PHOTO_AUTH_USER_ID?.trim()
  if (!email || !userId) throw new UploadApiError(503, 'Tài khoản nhân viên chưa được cấu hình.')
  return { email, userId }
}

export function staffSessionToken(request: ApiRequest) {
  const cookie = header(request, 'cookie') ?? ''
  for (const part of cookie.split(';')) {
    const [name, ...value] = part.trim().split('=')
    if (name === STAFF_SESSION_COOKIE) return decodeURIComponent(value.join('='))
  }
  return undefined
}

export function staffSessionCookie(token: string, maxAgeSeconds: number) {
  return `${STAFF_SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}; HttpOnly; Secure; SameSite=Strict`
}

export function clearStaffSessionCookie() {
  return `${STAFF_SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`
}

export async function requireStaff(request: ApiRequest) {
  const token = staffSessionToken(request)
  if (!token) throw new UploadApiError(401, 'Phiên đăng nhập không hợp lệ.')
  const environment = loadSupabaseStorageEnvironment()
  const client = createClient(environment.url, environment.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await client.auth.getUser(token)
  if (error || !data.user) throw new UploadApiError(401, 'Phiên đăng nhập đã hết hạn.')
  const identity = loadStaffIdentityEnvironment()
  if (data.user.id !== identity.userId) throw new UploadApiError(403, 'Tài khoản này không có quyền xem ảnh khách.')
  return { userId: data.user.id, client, environment }
}
