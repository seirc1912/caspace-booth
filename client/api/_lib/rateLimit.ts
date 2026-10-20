import { header, type ApiRequest, UploadApiError } from './http.js'

const attempts = new Map<string, number[]>()
const byteAttempts = new Map<string, Array<{ bytes: number; time: number }>>()

const clientIdPattern = /^[a-f0-9-]{36}$/i

function requestKey(request: ApiRequest) {
  const forwarded = header(request, 'x-forwarded-for')?.split(',')[0]?.trim()
  return forwarded || header(request, 'x-real-ip') || 'unknown'
}

function uploadClientId(request: ApiRequest) {
  const value = header(request, 'x-upload-client-id')?.trim() ?? ''
  return clientIdPattern.test(value) ? value.toLowerCase() : null
}

function pruneAttempts(key: string, windowMs: number, now: number) {
  const active = (attempts.get(key) ?? []).filter((time) => now - time < windowMs)
  attempts.set(key, active)
  return active
}

function pruneBytes(key: string, windowMs: number, now: number) {
  const active = (byteAttempts.get(key) ?? []).filter((entry) => now - entry.time < windowMs)
  byteAttempts.set(key, active)
  return active
}

function recordAttempt(key: string, limit: number, windowMs: number, now: number) {
  const active = pruneAttempts(key, windowMs, now)
  if (active.length >= limit) throw new UploadApiError(429, 'Bạn đã gửi quá nhiều yêu cầu. Vui lòng chờ một lúc rồi thử lại.', Math.ceil(windowMs / 1_000))
  active.push(now)
}

function recordBytes(key: string, bytes: number, limitBytes: number, windowMs: number, now: number) {
  const active = pruneBytes(key, windowMs, now)
  if (active.reduce((total, entry) => total + entry.bytes, 0) + bytes > limitBytes) throw new UploadApiError(429, 'Bạn đã gửi quá nhiều dữ liệu. Vui lòng chờ một lúc rồi thử lại.', Math.ceil(windowMs / 1_000))
  active.push({ bytes, time: now })
}

export function enforceRateLimit(request: ApiRequest, options = { limit: 30, windowMs: 10 * 60_000 }) {
  const now = Date.now()
  recordAttempt(`ip:${requestKey(request)}`, options.limit, options.windowMs, now)
  if (attempts.size > 2_000) {
    for (const [candidate, entries] of attempts) if (entries.every((time) => now - time >= options.windowMs)) attempts.delete(candidate)
  }
}

export function enforceUploadByteQuota(request: ApiRequest, bytes: number, options = { limitBytes: 250 * 1024 * 1024, windowMs: 10 * 60_000 }) {
  const now = Date.now()
  recordBytes(`ip:${requestKey(request)}`, bytes, options.limitBytes, options.windowMs, now)
}

/**
 * A shared cafe Wi-Fi exposes many legitimate devices behind one public IP.
 * Keep a strict per-browser budget while allowing a bounded shared-IP pool.
 * The IP ceiling still limits clients that rotate the untrusted browser id.
 */
export function enforceCustomerUploadLimits(request: ApiRequest, bytes: number, options = {
  clientBytes: 300 * 1024 * 1024,
  clientRequests: 80,
  ipBytes: 2 * 1024 * 1024 * 1024,
  ipRequests: 600,
  windowMs: 10 * 60_000,
}) {
  const now = Date.now()
  const ip = requestKey(request)
  const clientId = uploadClientId(request)
  if (!clientId) {
    recordAttempt(`legacy-ip:${ip}`, 30, options.windowMs, now)
    recordBytes(`legacy-ip:${ip}`, bytes, 250 * 1024 * 1024, options.windowMs, now)
    return
  }
  recordAttempt(`client:${ip}:${clientId}`, options.clientRequests, options.windowMs, now)
  recordBytes(`client:${ip}:${clientId}`, bytes, options.clientBytes, options.windowMs, now)
  recordAttempt(`shared-ip:${ip}`, options.ipRequests, options.windowMs, now)
  recordBytes(`shared-ip:${ip}`, bytes, options.ipBytes, options.windowMs, now)
  if (attempts.size > 4_000) {
    for (const [candidate, entries] of attempts) if (entries.every((time) => now - time >= options.windowMs)) attempts.delete(candidate)
  }
  if (byteAttempts.size > 4_000) {
    for (const [candidate, entries] of byteAttempts) if (entries.every((entry) => now - entry.time >= options.windowMs)) byteAttempts.delete(candidate)
  }
}

export function resetRateLimitsForTests() { attempts.clear(); byteAttempts.clear() }
