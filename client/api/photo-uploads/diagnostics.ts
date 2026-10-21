import { loadSupabaseStorageEnvironment } from '../_lib/supabaseStorage.js'
import { enforceSameOrigin, readJsonBody, sendApiError, setPrivateResponse, type ApiRequest, type ApiResponse, UploadApiError } from '../_lib/http.js'
import { enforceRateLimit } from '../_lib/rateLimit.js'
import { verifyUploadSessionToken } from '../_lib/uploadSession.js'

export const config = { maxDuration: 10 }

const stages = new Set(['hash', 'init', 'standard-transfer', 'tus-create', 'tus-resume', 'tus-transfer', 'verification'])
const transports = new Set(['api', 'standard', 'tus'])

function diagnosticBody(value: unknown) {
  if (!value || typeof value !== 'object') throw new UploadApiError(400, 'Chẩn đoán tải ảnh không hợp lệ.')
  const body = value as Record<string, unknown>
  const correlationId = typeof body.correlationId === 'string' && /^[0-9a-f-]{20,50}$/i.test(body.correlationId) ? body.correlationId : null
  const code = typeof body.code === 'string' && /^[A-Z0-9_]{3,80}$/.test(body.code) ? body.code : null
  const stage = typeof body.stage === 'string' && stages.has(body.stage) ? body.stage : null
  const transport = typeof body.transport === 'string' && transports.has(body.transport) ? body.transport : null
  const status = Number.isInteger(body.status) && Number(body.status) >= 0 && Number(body.status) <= 599 ? Number(body.status) : null
  const retryCount = Number.isInteger(body.retryCount) && Number(body.retryCount) >= 0 && Number(body.retryCount) <= 20 ? Number(body.retryCount) : null
  const durationMs = Number.isFinite(body.durationMs) && Number(body.durationMs) >= 0 && Number(body.durationMs) <= 30 * 60_000 ? Math.round(Number(body.durationMs)) : null
  if (!correlationId || !code || !stage || !transport || status === null || retryCount === null || durationMs === null) throw new UploadApiError(400, 'Chẩn đoán tải ảnh không hợp lệ.')
  return { code, correlationId, durationMs, retryCount, stage, status, transport }
}

export default function handler(request: ApiRequest, response: ApiResponse) {
  setPrivateResponse(response)
  if (request.method !== 'POST') { response.setHeader('Allow', 'POST'); response.status(405).json({ error: 'Phương thức không được hỗ trợ.' }); return }
  try {
    enforceSameOrigin(request)
    enforceRateLimit(request, { limit: 240, windowMs: 10 * 60_000 })
    const { serviceRoleKey } = loadSupabaseStorageEnvironment()
    if (!verifyUploadSessionToken(request, serviceRoleKey)) throw new UploadApiError(401, 'Phiên gửi ảnh đã hết hạn.')
    const diagnostic = diagnosticBody(readJsonBody(request))
    // This object is intentionally allow-listed: no phone, filename, path,
    // image bytes, URL, token, user agent, or IP is copied into application logs.
    console.warn('[photo-upload:failure]', diagnostic)
    response.status(202).json({ accepted: true, correlationId: diagnostic.correlationId })
  } catch (reason) {
    sendApiError(response, reason)
  }
}
