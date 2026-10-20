import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { header, type ApiRequest } from './http.js'

const sessionTokenPattern = /^v1\.([a-f0-9-]{36})\.(\d{10,13})\.([A-Za-z0-9_-]{43})$/i
const sessionLifetimeMs = 24 * 60 * 60_000

function signature(secret: string, id: string, expiresAt: number, userAgent: string) {
  return createHmac('sha256', secret)
    .update(`caspace-photo-upload-session:v1:${id}:${expiresAt}:${userAgent}`)
    .digest('base64url')
}

function userAgent(request: ApiRequest) {
  return header(request, 'user-agent')?.slice(0, 512) ?? ''
}

export function createUploadSessionToken(request: ApiRequest, secret: string, now = Date.now()) {
  const id = randomUUID()
  const expiresAt = now + sessionLifetimeMs
  return `v1.${id}.${expiresAt}.${signature(secret, id, expiresAt, userAgent(request))}`
}

export function verifyUploadSessionToken(request: ApiRequest, secret: string, now = Date.now()) {
  const token = header(request, 'x-upload-session')?.trim() ?? ''
  const match = sessionTokenPattern.exec(token)
  if (!match) return null
  const [, id = '', expiresText = '', suppliedSignature = ''] = match
  const expiresAt = Number(expiresText)
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= now) return null
  const expected = Buffer.from(signature(secret, id, expiresAt, userAgent(request)))
  const supplied = Buffer.from(suppliedSignature)
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null
  return id.toLowerCase()
}

function completionSignature(secret: string, sessionId: string, objectPath: string, sha256: string, size: number) {
  return createHmac('sha256', secret)
    .update(`caspace-photo-upload-completion:v1:${sessionId}:${objectPath}:${sha256}:${size}`)
    .digest('base64url')
}

export function createUploadCompletionToken(secret: string, sessionId: string, objectPath: string, sha256: string, size: number) {
  return completionSignature(secret, sessionId, objectPath, sha256, size)
}

export function verifyUploadCompletionToken(secret: string, sessionId: string, objectPath: string, sha256: string, size: number, token: string) {
  const expected = Buffer.from(completionSignature(secret, sessionId, objectPath, sha256, size))
  const supplied = Buffer.from(token)
  return expected.length === supplied.length && timingSafeEqual(expected, supplied)
}
