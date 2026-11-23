import { createClient } from '@supabase/supabase-js'
import { listBoothPhotos } from '../_lib/boothPhotos.js'
import { enforceSameOrigin, readJsonBody, sendApiError, setPrivateResponse, type ApiRequest, type ApiResponse, UploadApiError } from '../_lib/http.js'
import { enforceRateLimit } from '../_lib/rateLimit.js'
import { requireCustomerPhone } from '../_lib/staffPhotos.js'
import { loadSupabaseStorageEnvironment } from '../_lib/supabaseStorage.js'
import { verifyUploadSessionToken } from '../_lib/uploadSession.js'

export const config = { maxDuration: 30 }

// Customer view of their booth photos (6-hour window). Polled every ~10 s while the
// picker is open, so the limit is per signed browser session plus a wide shared-IP cap.
export default async function handler(request: ApiRequest, response: ApiResponse) {
  setPrivateResponse(response)
  if (request.method !== 'POST') { response.setHeader('Allow', 'POST'); response.status(405).json({ error: 'Phương thức không được hỗ trợ.' }); return }
  const startedAt = performance.now()
  try {
    enforceSameOrigin(request)
    enforceRateLimit(request, { limit: 2_000, windowMs: 10 * 60_000, scope: 'booth-photos-ip' })
    const environment = loadSupabaseStorageEnvironment()
    const sessionId = verifyUploadSessionToken(request, environment.serviceRoleKey)
    if (!sessionId) throw new UploadApiError(401, 'Phiên đã hết hạn. Vui lòng tải lại trang.')
    enforceRateLimit({ headers: { 'x-forwarded-for': sessionId } }, { limit: 120, windowMs: 10 * 60_000, scope: 'booth-photos-session' })
    const phone = requireCustomerPhone((readJsonBody(request) as Record<string, unknown> | undefined)?.phone)
    const client = createClient(environment.url, environment.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
    const result = await listBoothPhotos(client, phone)
    console.info('[booth-photos:timing]', { durationMs: Math.round(performance.now() - startedAt), status: result.status, count: result.photos.length })
    response.status(200).json(result)
  } catch (reason) {
    console.warn('[booth-photos:timing]', { durationMs: Math.round(performance.now() - startedAt), status: 'error', kind: reason instanceof Error ? reason.constructor.name : 'unknown' })
    sendApiError(response, reason)
  }
}
