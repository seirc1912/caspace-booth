import { loadSupabaseStorageEnvironment } from '../_lib/supabaseStorage.js'
import { enforceSameOrigin, sendApiError, setPrivateResponse, type ApiRequest, type ApiResponse } from '../_lib/http.js'
import { enforceRateLimit } from '../_lib/rateLimit.js'
import { createUploadSessionToken } from '../_lib/uploadSession.js'

export const config = { maxDuration: 10 }

export default async function handler(request: ApiRequest, response: ApiResponse) {
  setPrivateResponse(response)
  if (request.method !== 'POST') { response.setHeader('Allow', 'POST'); response.status(405).json({ error: 'Phương thức không được hỗ trợ.' }); return }
  try {
    enforceSameOrigin(request)
    enforceRateLimit(request, { limit: 60, windowMs: 10 * 60_000 })
    const { serviceRoleKey } = loadSupabaseStorageEnvironment()
    response.status(200).json({ token: createUploadSessionToken(request, serviceRoleKey) })
  } catch (reason) {
    console.error('[photo-upload] session initialization failed', { kind: reason instanceof Error ? reason.constructor.name : 'unknown' })
    sendApiError(response, reason)
  }
}
