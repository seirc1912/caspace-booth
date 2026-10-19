import { getGoogleAccessToken, GoogleDriveUploadService, loadGoogleDriveEnvironment } from '../_lib/googleDrive.js'
import { enforceSameOrigin, readJsonBody, sendApiError, setPrivateResponse, type ApiRequest, type ApiResponse } from '../_lib/http.js'
import { enforceRateLimit } from '../_lib/rateLimit.js'
import { parseCompletionMetadata } from '../_lib/uploadValidation.js'

export const config = { maxDuration: 30 }

export default async function handler(request: ApiRequest, response: ApiResponse) {
  setPrivateResponse(response)
  if (request.method !== 'POST') { response.setHeader('Allow', 'POST'); response.status(405).json({ error: 'Phương thức không được hỗ trợ.' }); return }
  try {
    enforceSameOrigin(request)
    enforceRateLimit(request, { limit: 60, windowMs: 10 * 60_000 })
    const metadata = parseCompletionMetadata(readJsonBody(request))
    const environment = loadGoogleDriveEnvironment()
    const accessToken = await getGoogleAccessToken(environment)
    const drive = new GoogleDriveUploadService(accessToken, environment.parentFolderId)
    await drive.verifyCompletedUpload(metadata)
    response.status(200).json({ ok: true })
  } catch (reason) {
    console.error('[photo-upload] completion failed', { kind: reason instanceof Error ? reason.constructor.name : 'unknown' })
    sendApiError(response, reason)
  }
}
