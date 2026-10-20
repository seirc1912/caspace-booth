import { header, type ApiRequest, UploadApiError } from './http.js'

const attempts = new Map<string, number[]>()
const byteAttempts = new Map<string, Array<{ bytes: number; time: number }>>()
const byteReservations = new Map<string, { bytes: number; time: number }>()

export const CUSTOMER_UPLOAD_WINDOW_MS = 10 * 60_000
export const CUSTOMER_UPLOAD_SESSION_BYTES = 1_000 * 1024 * 1024
export const CUSTOMER_UPLOAD_SHARED_IP_BYTES = 5_000 * 1024 * 1024

function requestKey(request: ApiRequest) {
  const forwarded = header(request, 'x-forwarded-for')?.split(',')[0]?.trim()
  return forwarded || header(request, 'x-real-ip') || 'unknown'
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

function reserveBytes(key: string, reservationId: string, bytes: number, limitBytes: number, windowMs: number, now: number) {
  for (const [candidate, reservation] of byteReservations) if (now - reservation.time >= windowMs) byteReservations.delete(candidate)
  const reservationKey = `${key}:${reservationId}`
  const existing = byteReservations.get(reservationKey)
  if (existing) {
    if (existing.bytes !== bytes) throw new UploadApiError(409, 'Thông tin dung lượng tải lên không nhất quán.')
    return
  }
  recordBytes(key, bytes, limitBytes, windowMs, now)
  byteReservations.set(reservationKey, { bytes, time: now })
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
 * Keep a strict signed-browser-session budget while allowing a bounded
 * shared-IP pool. The IP ceiling still limits clients that rotate sessions.
 * Byte reservations are idempotent per upload request, so retries and TUS
 * resume operations do not consume the allowance twice.
 */
export function enforceCustomerUploadLimits(request: ApiRequest, bytes: number, sessionId: string | null, reservationId?: string, options = {
  clientBytes: CUSTOMER_UPLOAD_SESSION_BYTES,
  clientRequests: 200,
  ipBytes: CUSTOMER_UPLOAD_SHARED_IP_BYTES,
  ipRequests: 3_000,
  windowMs: CUSTOMER_UPLOAD_WINDOW_MS,
}) {
  const now = Date.now()
  const ip = requestKey(request)
  if (!sessionId) {
    recordAttempt(`legacy-ip:${ip}`, 30, options.windowMs, now)
    recordBytes(`legacy-ip:${ip}`, bytes, 250 * 1024 * 1024, options.windowMs, now)
    return
  }
  recordAttempt(`client:${sessionId}`, options.clientRequests, options.windowMs, now)
  if (reservationId) reserveBytes(`client:${sessionId}`, reservationId, bytes, options.clientBytes, options.windowMs, now)
  else recordBytes(`client:${sessionId}`, bytes, options.clientBytes, options.windowMs, now)
  recordAttempt(`shared-ip:${ip}`, options.ipRequests, options.windowMs, now)
  if (reservationId) reserveBytes(`shared-ip:${ip}`, `${sessionId}:${reservationId}`, bytes, options.ipBytes, options.windowMs, now)
  else recordBytes(`shared-ip:${ip}`, bytes, options.ipBytes, options.windowMs, now)
  if (attempts.size > 4_000) {
    for (const [candidate, entries] of attempts) if (entries.every((time) => now - time >= options.windowMs)) attempts.delete(candidate)
  }
  if (byteAttempts.size > 4_000) {
    for (const [candidate, entries] of byteAttempts) if (entries.every((entry) => now - entry.time >= options.windowMs)) byteAttempts.delete(candidate)
  }
}

export function resetRateLimitsForTests() { attempts.clear(); byteAttempts.clear(); byteReservations.clear() }
