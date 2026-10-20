import { loadSupabaseStorageEnvironment, SupabasePhotoUploadService } from '../_lib/supabaseStorage.js'
import { enforceSameOrigin, readJsonBody, sendApiError, setPrivateResponse, type ApiRequest, type ApiResponse, UploadApiError } from '../_lib/http.js'
import { enforceCustomerUploadLimits } from '../_lib/rateLimit.js'
import { createUploadCompletionToken, verifyUploadSessionToken } from '../_lib/uploadSession.js'
import { parseUploadMetadata } from '../_lib/uploadValidation.js'

export const config = { maxDuration: 30 }

export default async function handler(request: ApiRequest, response: ApiResponse) {
  setPrivateResponse(response)
  if (request.method !== 'POST') { response.setHeader('Allow', 'POST'); response.status(405).json({ error: 'Phương thức không được hỗ trợ.' }); return }
  try {
    enforceSameOrigin(request)
    const metadata = parseUploadMetadata(readJsonBody(request))
    const environment = loadSupabaseStorageEnvironment()
    const sessionId = verifyUploadSessionToken(request, environment.serviceRoleKey)
    enforceCustomerUploadLimits(request, metadata.size, sessionId, metadata.requestId)
    if (!sessionId) throw new UploadApiError(401, 'Phiên gửi ảnh đã hết hạn. Vui lòng thử lại.')
    const storage = new SupabasePhotoUploadService(environment)
    const startedAt = performance.now()
    const result = await storage.createSignedUpload(metadata)
    const completionToken = createUploadCompletionToken(environment.serviceRoleKey, sessionId, result.objectPath, metadata.sha256, metadata.size)
    const durationMs = Math.round(performance.now() - startedAt)
    response.setHeader('Server-Timing', `upload-init;dur=${durationMs}`)
    console.info('[photo-upload:timing]', { stage: 'init', durationMs, sizeBand: metadata.size <= 6 * 1024 * 1024 ? 'small' : 'large', outcome: 'ok' })
    response.status(200).json({ ...result, completionToken })
  } catch (reason) {
    console.error('[photo-upload] init failed', { kind: reason instanceof Error ? reason.constructor.name : 'unknown' })
    sendApiError(response, reason)
  }
}
