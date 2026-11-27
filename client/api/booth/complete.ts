import { BOOTH_UPLOAD_IP_LIMIT, enforceBoothUploadLimit, requireBooth } from '../_lib/boothAuth.js'
import { parseBoothCompletion, verifyBoothCompletionToken } from '../_lib/boothPaths.js'
import { readJsonBody, sendApiError, setPrivateResponse, type ApiRequest, type ApiResponse, UploadApiError } from '../_lib/http.js'
import { enforceRateLimit } from '../_lib/rateLimit.js'
import { loadSupabaseStorageEnvironment, SupabasePhotoUploadService } from '../_lib/supabaseStorage.js'

export const config = { maxDuration: 60 }

export default async function handler(request: ApiRequest, response: ApiResponse) {
  setPrivateResponse(response)
  if (request.method !== 'POST') { response.setHeader('Allow', 'POST'); response.status(405).json({ error: 'Phương thức không được hỗ trợ.' }); return }
  let boothId = 'unknown'
  const startedAt = performance.now()
  try {
    enforceRateLimit(request, BOOTH_UPLOAD_IP_LIMIT)
    boothId = requireBooth(request).boothId
    enforceBoothUploadLimit(boothId)
    const completion = parseBoothCompletion(readJsonBody(request))
    const environment = loadSupabaseStorageEnvironment()
    if (!verifyBoothCompletionToken(environment.serviceRoleKey, boothId, completion)) throw new UploadApiError(403, 'Phiên xác minh ảnh không hợp lệ.')
    await new SupabasePhotoUploadService(environment).verifyBoothObjectAt(completion, completion.objectPath)
    console.info('[booth-upload:timing]', { stage: 'verification', boothId, variant: completion.variant, durationMs: Math.round(performance.now() - startedAt), outcome: 'ok' })
    response.status(200).json({ ok: true, objectPath: completion.objectPath })
  } catch (reason) {
    console.warn('[booth-upload:timing]', { stage: 'verification', boothId, durationMs: Math.round(performance.now() - startedAt), outcome: 'error', kind: reason instanceof Error ? reason.constructor.name : 'unknown' })
    sendApiError(response, reason)
  }
}
