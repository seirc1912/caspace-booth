import { UploadApiError } from './http.js'

export const MAX_UPLOAD_FILE_BYTES = 25 * 1024 * 1024
const phonePattern = /^0(?:3|5|7|8|9)\d{8}$/
const sha256Pattern = /^[a-f0-9]{64}$/
const requestIdPattern = /^[a-zA-Z0-9_-]{8,120}$/

export interface UploadMetadata {
  filename: string
  mimeType: 'image/png' | 'image/jpeg'
  phone: string
  prefix: string
  requestId: string
  sha256: string
  size: number
}

export function normalizeVietnamesePhone(value: string) {
  const compact = value.trim().replace(/[\s().-]/g, '')
  if (compact.startsWith('+84')) return `0${compact.slice(3)}`
  if (compact.startsWith('84') && compact.length === 11) return `0${compact.slice(2)}`
  return compact
}

export function sanitizeFilename(value: string) {
  const normalized = value.normalize('NFC').split(/[\\/]/).pop()?.split('').filter((character) => {
    const code = character.charCodeAt(0)
    return code > 31 && code !== 127
  }).join('').trim() ?? ''
  const safe = normalized.replace(/\s+/g, ' ').replace(/^\.+/, '').slice(0, 140)
  if (!safe || safe === '.' || safe === '..') throw new UploadApiError(400, 'Tên tệp ảnh không hợp lệ.')
  return safe
}

export function hasValidImageSignature(prefixBase64: string, mimeType: UploadMetadata['mimeType']) {
  let bytes: Uint8Array
  try { bytes = new Uint8Array(Buffer.from(prefixBase64, 'base64')) } catch { return false }
  if (mimeType === 'image/png') return bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
}

export function parseUploadMetadata(value: unknown): UploadMetadata {
  if (!value || typeof value !== 'object') throw new UploadApiError(400, 'Thông tin tải ảnh không hợp lệ.')
  const record = value as Record<string, unknown>
  const phone = normalizeVietnamesePhone(String(record.phone ?? ''))
  const mimeType = String(record.mimeType ?? '')
  const size = Number(record.size)
  const metadata: UploadMetadata = {
    filename: sanitizeFilename(String(record.filename ?? '')),
    mimeType: mimeType === 'image/png' ? 'image/png' : mimeType === 'image/jpeg' ? 'image/jpeg' : (() => { throw new UploadApiError(415, 'Chỉ hỗ trợ ảnh PNG, JPG và JPEG.') })(),
    phone,
    prefix: String(record.prefix ?? ''),
    requestId: String(record.requestId ?? ''),
    sha256: String(record.sha256 ?? '').toLowerCase(),
    size,
  }
  if (!phonePattern.test(phone)) throw new UploadApiError(400, 'Vui lòng nhập đúng số điện thoại Việt Nam.')
  if (!Number.isSafeInteger(size) || size <= 0 || size > MAX_UPLOAD_FILE_BYTES) throw new UploadApiError(413, 'Mỗi ảnh phải có dung lượng từ 1 byte đến 25 MB.')
  if (!sha256Pattern.test(metadata.sha256) || !requestIdPattern.test(metadata.requestId)) throw new UploadApiError(400, 'Thông tin xác minh ảnh không hợp lệ.')
  if (!hasValidImageSignature(metadata.prefix, metadata.mimeType)) throw new UploadApiError(415, 'Nội dung tệp không đúng định dạng PNG hoặc JPEG.')
  const extensionMatches = metadata.mimeType === 'image/png' ? /\.png$/i.test(metadata.filename) : /\.jpe?g$/i.test(metadata.filename)
  if (!extensionMatches) throw new UploadApiError(415, 'Phần mở rộng tệp không khớp với định dạng ảnh.')
  return metadata
}

export interface CompletionMetadata extends UploadMetadata { objectPath: string }

export function parseCompletionMetadata(value: unknown): CompletionMetadata {
  const metadata = parseUploadMetadata(value)
  const objectPath = String((value as Record<string, unknown>).objectPath ?? '')
  if (!/^[^/]+\/[\p{L}\p{N} _.,()-]+$/u.test(objectPath) || objectPath.length > 240) throw new UploadApiError(400, 'Thông tin xác nhận không hợp lệ.')
  return { ...metadata, objectPath }
}
