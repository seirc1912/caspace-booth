import { BOOTH_UPLOAD_IP_LIMIT, enforceBoothUploadLimit, requireBooth } from '../_lib/boothAuth.js'
import { createBoothCompletionToken, parseBoothUploadMetadata, prepareBoothUpload } from '../_lib/boothPaths.js'
import { readJsonBody, sendApiError, setPrivateResponse, type ApiRequest, type ApiResponse } from '../_lib/http.js'
import { enforceRateLimit } from '../_lib/rateLimit.js'
import { loadSupabaseStorageEnvironment, SupabasePhotoUploadService } from '../_lib/supabaseStorage.js'

export const config = { maxDuration: 30 }

// Called by the booth agent on the Windows PC (not a browser): no same-origin check,
// authenticated by the per-booth key instead.
export default async function handler(request: ApiRequest, response: ApiResponse) {
  setPrivateResponse(response)
  if (request.method !== 'POST') { response.setHeader('Allow', 'POST'); response.status(405).json({ error: 'Phương thức không được hỗ trợ.' }); return }
  let boothId = 'unknown'
  const startedAt = performance.now()
  try {
    enforceRateLimit(request, BOOTH_UPLOAD_IP_LIMIT)
    boothId = requireBooth(request).boothId
    enforceBoothUploadLimit(boothId)
    const metadata = parseBoothUploadMetadata(readJsonBody(request))
    const environment = loadSupabaseStorageEnvironment()
    const result = await prepareBoothUpload(new SupabasePhotoUploadService(environment), metadata)
    const completionToken = createBoothCompletionToken(environment.serviceRoleKey, boothId, result.objectPath, metadata.sha256, metadata.size)
    console.info('[booth-upload:timing]', { stage: 'init', boothId, variant: metadata.variant, durationMs: Math.round(performance.now() - startedAt), outcome: result.alreadyUploaded ? 'already' : 'ok' })
    response.status(200).json({ ...result, completionToken })
  } catch (reason) {
    console.warn('[booth-upload:timing]', { stage: 'init', boothId, durationMs: Math.round(performance.now() - startedAt), outcome: 'error', kind: reason instanceof Error ? reason.constructor.name : 'unknown' })
    sendApiError(response, reason)
  }
}
