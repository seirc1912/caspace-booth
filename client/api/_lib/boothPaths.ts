import { createHmac, timingSafeEqual } from 'node:crypto'
import { UploadApiError } from './http.js'
import type { SupabasePhotoUploadService } from './supabaseStorage.js'
import { hasValidImageSignature, MAX_THUMBNAIL_BYTES, MAX_UPLOAD_FILE_BYTES, normalizeVietnamesePhone, sanitizeFilename, type UploadMetadata } from './uploadValidation.js'

export const BOOTH_FOLDER = '_booth'
export const BOOTH_THUMBS = '_thumbs'
export const BOOTH_ACCESS_FILE = '_access.json'
const phonePattern = /^0(?:3|5|7|8|9)\d{8}$/
const sha256Pattern = /^[a-f0-9]{64}$/
// Characters Supabase object keys accept (its key check rejects `~`, `#`, `%`…);
// Capture One names are `0947860616-103333.jpg`.
const nameCharacters = /[^\p{L}\p{N} _.,()-]/gu

export interface BoothUploadMetadata extends UploadMetadata {
  originalPath: string | null
}

export function boothOriginalPath(phone: string, filename: string) {
  return `${phone}/${BOOTH_FOLDER}/${filename}`
}

/** `p/_booth/a.jpg` → `p/_booth/_thumbs/a-thumb.jpg` */
export function boothThumbnailPath(originalPath: string) {
  const slash = originalPath.lastIndexOf('/')
  const name = originalPath.slice(slash + 1)
  const dot = name.lastIndexOf('.')
  return `${originalPath.slice(0, slash)}/${BOOTH_THUMBS}/${dot > 0 ? name.slice(0, dot) : name}-thumb.jpg`
}

/** Same name, different content (two sessions, or a re-export) → keep both: `a.jpg` → `a__1a2b3c4d.jpg`. */
export function withContentSuffix(path: string, sha256: string) {
  const dot = path.lastIndexOf('.')
  return `${path.slice(0, dot)}__${sha256.slice(0, 8)}${path.slice(dot)}`
}

function isBoothOriginalPath(phone: string, path: string) {
  const prefix = `${phone}/${BOOTH_FOLDER}/`
  if (!path.startsWith(prefix) || path.length > 260) return false
  const name = path.slice(prefix.length)
  return !name.includes('/') && /\.jpe?g$/i.test(name) && name.replace(nameCharacters, '') === name && !name.startsWith('.')
}

export function parseBoothUploadMetadata(value: unknown): BoothUploadMetadata {
  if (!value || typeof value !== 'object') throw new UploadApiError(400, 'Thông tin ảnh phòng chụp không hợp lệ.')
  const record = value as Record<string, unknown>
  const phone = normalizeVietnamesePhone(String(record.phone ?? ''))
  if (!phonePattern.test(phone)) throw new UploadApiError(400, 'Số điện thoại của thư mục không hợp lệ.')
  const filename = sanitizeFilename(String(record.filename ?? '')).replace(nameCharacters, '').replace(/^\.+/, '')
  if (!filename || !/\.jpe?g$/i.test(filename) || String(record.mimeType) !== 'image/jpeg') throw new UploadApiError(415, 'Máy phòng chụp chỉ gửi ảnh JPEG.')
  const size = Number(record.size)
  const sha256 = String(record.sha256 ?? '').toLowerCase()
  const prefix = String(record.prefix ?? '')
  const variant = record.variant === 'thumbnail' ? 'thumbnail' : record.variant === 'original' ? 'original' : null
  if (!variant) throw new UploadApiError(400, 'Thông tin ảnh phòng chụp không hợp lệ.')
  const limit = variant === 'thumbnail' ? MAX_THUMBNAIL_BYTES : MAX_UPLOAD_FILE_BYTES
  if (!Number.isSafeInteger(size) || size <= 0 || size > limit) throw new UploadApiError(413, 'Dung lượng ảnh phòng chụp không hợp lệ.')
  if (!sha256Pattern.test(sha256)) throw new UploadApiError(400, 'Thông tin xác minh ảnh không hợp lệ.')
  if (!hasValidImageSignature(prefix, 'image/jpeg')) throw new UploadApiError(415, 'Nội dung tệp không đúng định dạng JPEG.')
  let originalPath: string | null = null
  if (variant === 'thumbnail') {
    originalPath = String(record.originalPath ?? '')
    if (!isBoothOriginalPath(phone, originalPath)) throw new UploadApiError(400, 'Ảnh nhỏ không khớp ảnh gốc.')
  }
  return { filename, mimeType: 'image/jpeg', phone, prefix, requestId: `booth-${sha256.slice(0, 16)}`, sha256, size, variant, originalPath }
}

export interface BoothCompletion extends BoothUploadMetadata { objectPath: string; completionToken: string }

export function parseBoothCompletion(value: unknown): BoothCompletion {
  const metadata = parseBoothUploadMetadata(value)
  const record = value as Record<string, unknown>
  const objectPath = String(record.objectPath ?? '')
  const valid = metadata.variant === 'thumbnail'
    ? objectPath === boothThumbnailPath(metadata.originalPath!)
    : isBoothOriginalPath(metadata.phone, objectPath)
  if (!valid) throw new UploadApiError(400, 'Thông tin xác nhận không hợp lệ.')
  return { ...metadata, objectPath, completionToken: String(record.completionToken ?? '') }
}

function completionSignature(secret: string, boothId: string, objectPath: string, sha256: string, size: number) {
  return createHmac('sha256', secret).update(`caspace-booth-completion:v1:${boothId}:${objectPath}:${sha256}:${size}`).digest('base64url')
}

export function createBoothCompletionToken(secret: string, boothId: string, objectPath: string, sha256: string, size: number) {
  return completionSignature(secret, boothId, objectPath, sha256, size)
}

export function verifyBoothCompletionToken(secret: string, boothId: string, completion: BoothCompletion) {
  const expected = Buffer.from(completionSignature(secret, boothId, completion.objectPath, completion.sha256, completion.size))
  const supplied = Buffer.from(completion.completionToken)
  return expected.length === supplied.length && timingSafeEqual(expected, supplied)
}

type BoothStorage = Pick<SupabasePhotoUploadService, 'createSignedUploadAt' | 'objectExists' | 'objectSha256'>

/**
 * Chooses where a booth file goes. Originals: same content at the plain path →
 * already uploaded; different content → `~sha8` sibling (never overwrite, never lose
 * a photo). Thumbnails: any existing thumbnail is good enough.
 */
export async function prepareBoothUpload(storage: BoothStorage, metadata: BoothUploadMetadata) {
  if (metadata.variant === 'thumbnail') {
    const objectPath = boothThumbnailPath(metadata.originalPath!)
    if (await storage.objectExists(objectPath)) return { alreadyUploaded: true as const, objectPath }
    return storage.createSignedUploadAt(objectPath, metadata)
  }
  const plain = boothOriginalPath(metadata.phone, metadata.filename)
  for (const objectPath of [plain, withContentSuffix(plain, metadata.sha256)]) {
    const existing = await storage.objectSha256(objectPath)
    if (existing === null) return storage.createSignedUploadAt(objectPath, metadata)
    if (existing === metadata.sha256) return { alreadyUploaded: true as const, objectPath }
  }
  throw new UploadApiError(409, 'Ảnh trùng tên đã tồn tại với nội dung khác.')
}
