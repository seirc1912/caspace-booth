import { header, type ApiRequest, UploadApiError } from './http.js'

const attempts = new Map<string, number[]>()

export function enforceRateLimit(request: ApiRequest, options = { limit: 30, windowMs: 10 * 60_000 }) {
  const now = Date.now()
  const forwarded = header(request, 'x-forwarded-for')?.split(',')[0]?.trim()
  const key = forwarded || header(request, 'x-real-ip') || 'unknown'
  const active = (attempts.get(key) ?? []).filter((time) => now - time < options.windowMs)
  if (active.length >= options.limit) throw new UploadApiError(429, 'Bạn đã gửi quá nhiều yêu cầu. Vui lòng chờ một lúc rồi thử lại.')
  active.push(now)
  attempts.set(key, active)
  if (attempts.size > 2_000) {
    for (const [candidate, entries] of attempts) if (entries.every((time) => now - time >= options.windowMs)) attempts.delete(candidate)
  }
}

export function resetRateLimitsForTests() { attempts.clear() }
