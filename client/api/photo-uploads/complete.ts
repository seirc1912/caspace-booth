import { loadSupabaseStorageEnvironment, SupabasePhotoUploadService } from '../_lib/supabaseStorage.js'
import { enforceSameOrigin, readJsonBody, sendApiError, setPrivateResponse, type ApiRequest, type ApiResponse } from '../_lib/http.js'
import { enforceCustomerUploadLimits } from '../_lib/rateLimit.js'
import { parseCompletionMetadata } from '../_lib/uploadValidation.js'

export const config = { maxDuration: 60 }

export default async function handler(request: ApiRequest, response: ApiResponse) {
  setPrivateResponse(response)
  if (request.method !== 'POST') { response.setHeader('Allow', 'POST'); response.status(405).json({ error: 'Phương thức không được hỗ trợ.' }); return }
  try {
    enforceSameOrigin(request)
    enforceCustomerUploadLimits(request, 0)
    const metadata = parseCompletionMetadata(readJsonBody(request))
    const storage = new SupabasePhotoUploadService(loadSupabaseStorageEnvironment())
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
