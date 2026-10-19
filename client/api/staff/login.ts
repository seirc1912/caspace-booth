import { createClient } from '@supabase/supabase-js'
import { STAFF_PUBLIC_USERNAME, loadStaffIdentityEnvironment, staffSessionCookie } from '../_lib/staffAuth.js'
import { enforceSameOrigin, readJsonBody, sendApiError, setPrivateResponse, type ApiRequest, type ApiResponse, UploadApiError } from '../_lib/http.js'
import { enforceRateLimit } from '../_lib/rateLimit.js'
import { loadSupabaseStorageEnvironment } from '../_lib/supabaseStorage.js'

export const config = { maxDuration: 15 }

export function parseStaffLoginCredentials(value: unknown) {
  if (!value || typeof value !== 'object') throw new UploadApiError(401, 'Tên đăng nhập hoặc mật khẩu không đúng.')
  const username = 'username' in value && typeof value.username === 'string' ? value.username.trim() : ''
  const password = 'password' in value && typeof value.password === 'string' ? value.password : ''
  if (username !== STAFF_PUBLIC_USERNAME || !password || password.length > 256) throw new UploadApiError(401, 'Tên đăng nhập hoặc mật khẩu không đúng.')
  return { password }
}

export default async function handler(request: ApiRequest, response: ApiResponse) {
  setPrivateResponse(response)
  if (request.method !== 'POST') { response.setHeader('Allow', 'POST'); response.status(405).json({ error: 'Phương thức không được hỗ trợ.' }); return }
  try {
    enforceSameOrigin(request)
    enforceRateLimit(request, { limit: 5, windowMs: 15 * 60_000 })
    const { password } = parseStaffLoginCredentials(readJsonBody(request))
    const identity = loadStaffIdentityEnvironment()
    const environment = loadSupabaseStorageEnvironment()
    const client = createClient(environment.url, environment.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data, error } = await client.auth.signInWithPassword({ email: identity.email, password })
    if (error || !data.session || data.user.id !== identity.userId) throw new UploadApiError(401, 'Tên đăng nhập hoặc mật khẩu không đúng.')
    response.setHeader('Set-Cookie', staffSessionCookie(data.session.access_token, data.session.expires_in))
    response.status(200).json({ authenticated: true })
  } catch (reason) {
    console.warn('[staff-auth] login rejected', { kind: reason instanceof Error ? reason.constructor.name : 'unknown' })
    sendApiError(response, reason)
  }
}
