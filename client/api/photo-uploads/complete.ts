import { loadSupabaseStorageEnvironment, SupabasePhotoUploadService } from '../_lib/supabaseStorage.js'
import { enforceSameOrigin, readJsonBody, sendApiError, setPrivateResponse, type ApiRequest, type ApiResponse, UploadApiError } from '../_lib/http.js'
import { enforceCustomerUploadLimits } from '../_lib/rateLimit.js'
import { parseCompletionMetadata } from '../_lib/uploadValidation.js'
import { verifyUploadCompletionToken, verifyUploadSessionToken } from '../_lib/uploadSession.js'

export const config = { maxDuration: 60 }

export default async function handler(request: ApiRequest, response: ApiResponse) {
  setPrivateResponse(response)
  if (request.method !== 'POST') { response.setHeader('Allow', 'POST'); response.status(405).json({ error: 'Phương thức không được hỗ trợ.' }); return }
  try {
    enforceSameOrigin(request)
    const rawBody = readJsonBody(request)
    const metadata = parseCompletionMetadata(rawBody)
    const environment = loadSupabaseStorageEnvironment()
    const sessionId = verifyUploadSessionToken(request, environment.serviceRoleKey)
    enforceCustomerUploadLimits(request, 0, sessionId)
    if (!sessionId) throw new UploadApiError(401, 'Phiên gửi ảnh đã hết hạn. Vui lòng thử lại.')
    const completionToken = String((rawBody as Record<string, unknown>).completionToken ?? '')
    if (!verifyUploadCompletionToken(environment.serviceRoleKey, sessionId, metadata.objectPath, metadata.sha256, metadata.size, completionToken)) {
      throw new UploadApiError(403, 'Phiên xác minh ảnh không hợp lệ.')
    }
    const storage = new SupabasePhotoUploadService(environment)
    const startedAt = performance.now()
    const verified = await storage.verifyUploadedObject(metadata, metadata.objectPath)
    const durationMs = Math.round(performance.now() - startedAt)
    response.setHeader('Server-Timing', `upload-verify;dur=${durationMs}`)
    console.info('[photo-upload:timing]', { stage: 'verification', durationMs, storageResponseMs: verified.timing.storageResponseMs, streamVerificationMs: verified.timing.streamVerificationMs, sizeBand: metadata.size <= 6 * 1024 * 1024 ? 'small' : 'large', outcome: 'ok' })
    response.status(200).json({ ok: true })
  } catch (reason) {
    console.error('[photo-upload] completion failed', { kind: reason instanceof Error ? reason.constructor.name : 'unknown' })
    sendApiError(response, reason)
  }
}
