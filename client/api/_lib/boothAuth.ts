import { createHash, timingSafeEqual } from 'node:crypto'
import { header, type ApiRequest, UploadApiError } from './http.js'
import { assertBelowLimit, enforceRateLimit } from './rateLimit.js'

// Booth keys are 8 characters: after 20 wrong keys from one IP in 10 minutes that IP is
// refused even with the right key, so guessing is not practical.
export const BOOTH_AUTH_FAILURES = { limit: 20, windowMs: 10 * 60_000, scope: 'booth-auth-fail' }

const boothIdPattern = /^[a-z0-9-]{1,32}$/
const hashPattern = /^[a-f0-9]{64}$/

/**
 * Each booth PC holds its own key; Vercel only stores SHA-256 hashes in
 * `BOOTH_UPLOAD_KEYS` = {"booth-1":"<sha256 hex>", …}. Removing an entry revokes
 * that PC. A booth key can only create uploads under `{phone}/_booth/`.
 */
function loadBoothKeyHashes(env: Record<string, string | undefined>) {
  const raw = env.BOOTH_UPLOAD_KEYS?.trim()
  if (!raw) throw new UploadApiError(503, 'Máy phòng chụp chưa được cấu hình.')
  let parsed: unknown
  try { parsed = JSON.parse(raw) } catch { throw new UploadApiError(503, 'Cấu hình máy phòng chụp không hợp lệ.') }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new UploadApiError(503, 'Cấu hình máy phòng chụp không hợp lệ.')
  const entries = Object.entries(parsed as Record<string, unknown>)
  if (!entries.length || entries.some(([id, hash]) => !boothIdPattern.test(id) || typeof hash !== 'string' || !hashPattern.test(hash.toLowerCase()))) {
    throw new UploadApiError(503, 'Cấu hình máy phòng chụp không hợp lệ.')
  }
  return entries.map(([boothId, hash]) => ({ boothId, hash: Buffer.from(String(hash).toLowerCase(), 'hex') }))
}

export function requireBooth(request: ApiRequest, env: Record<string, string | undefined> = process.env) {
  const hashes = loadBoothKeyHashes(env)
  assertBelowLimit(request, BOOTH_AUTH_FAILURES)
  const fail = (): never => { enforceRateLimit(request, BOOTH_AUTH_FAILURES); throw new UploadApiError(401, 'Máy phòng chụp chưa được xác thực.') }
  const match = /^Bearer\s+(\S{8,256})$/.exec(header(request, 'authorization')?.trim() ?? '')
  if (!match) return fail()
  const supplied = createHash('sha256').update(match[1]!).digest()
  let boothId: string | null = null
  for (const entry of hashes) if (timingSafeEqual(entry.hash, supplied)) boothId = entry.boothId
  if (!boothId) return fail()
  return { boothId }
}
