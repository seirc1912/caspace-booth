import { header, type ApiRequest, UploadApiError } from './http.js'

const attempts = new Map<string, number[]>()
const byteAttempts = new Map<string, Array<{ bytes: number; time: number }>>()

function requestKey(request: ApiRequest) {
  const forwarded = header(request, 'x-forwarded-for')?.split(',')[0]?.trim()
  return forwarded || header(request, 'x-real-ip') || 'unknown'
}

export function enforceRateLimit(request: ApiRequest, options = { limit: 30, windowMs: 10 * 60_000 }) {
  const now = Date.now()
  const key = requestKey(request)
  const active = (attempts.get(key) ?? []).filter((time) => now - time < options.windowMs)
  if (active.length >= options.limit) throw new UploadApiError(429, 'Bạn đã gửi quá nhiều yêu cầu. Vui lòng chờ một lúc rồi thử lại.')
  active.push(now)
  attempts.set(key, active)
  if (attempts.size > 2_000) {
    for (const [candidate, entries] of attempts) if (entries.every((time) => now - time >= options.windowMs)) attempts.delete(candidate)
  }
}

export function enforceUploadByteQuota(request: ApiRequest, bytes: number, options = { limitBytes: 250 * 1024 * 1024, windowMs: 10 * 60_000 }) {
  const now = Date.now()
  const key = requestKey(request)
  const active = (byteAttempts.get(key) ?? []).filter((entry) => now - entry.time < options.windowMs)
  if (active.reduce((total, entry) => total + entry.bytes, 0) + bytes > options.limitBytes) throw new UploadApiError(429, 'Bạn đã gửi quá nhiều dữ liệu. Vui lòng chờ một lúc rồi thử lại.')
  active.push({ bytes, time: now })
  byteAttempts.set(key, active)
}

export function resetRateLimitsForTests() { attempts.clear(); byteAttempts.clear() }
