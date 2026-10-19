import { loadSupabaseStorageEnvironment, SupabasePhotoUploadService } from '../_lib/supabaseStorage.js'
import { enforceSameOrigin, readJsonBody, sendApiError, setPrivateResponse, type ApiRequest, type ApiResponse } from '../_lib/http.js'
import { enforceRateLimit, enforceUploadByteQuota } from '../_lib/rateLimit.js'
import { parseUploadMetadata } from '../_lib/uploadValidation.js'

export const config = { maxDuration: 30 }

export default async function handler(request: ApiRequest, response: ApiResponse) {
  setPrivateResponse(response)
  if (request.method !== 'POST') { response.setHeader('Allow', 'POST'); response.status(405).json({ error: 'Phương thức không được hỗ trợ.' }); return }
  try {
    enforceSameOrigin(request)
    enforceRateLimit(request)
    const metadata = parseUploadMetadata(readJsonBody(request))
    enforceUploadByteQuota(request, metadata.size)
    const storage = new SupabasePhotoUploadService(loadSupabaseStorageEnvironment())
    response.status(200).json(await storage.createSignedUpload(metadata))
  } catch (reason) {
    console.error('[photo-upload] init failed', { kind: reason instanceof Error ? reason.constructor.name : 'unknown' })
    sendApiError(response, reason)
  }
}
