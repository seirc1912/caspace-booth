import { createHash } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { UploadApiError } from './http.js'
import { hasValidImageSignature, type UploadMetadata } from './uploadValidation.js'

export const customerPhotoBucket = 'customer-photo-uploads'
export const THUMBNAIL_FOLDER = '_thumbs'
/** 1600px copies of /upload-anh photos for the large viewer (made on the customer's phone). */
export const PREVIEW_FOLDER = '_previews'

export interface SupabaseStorageEnvironment {
  serviceRoleKey: string
  url: string
}

interface StorageClient {
  storage: {
    from(bucket: string): {
      createSignedUploadUrl(path: string, options: { upsert: boolean }): Promise<{ data: null | { signedUrl: string; token?: string }; error: null | { message: string } }>
      exists(path: string): Promise<{ data: boolean; error: null | { message: string; status?: number } }>
    }
  }
}

function required(name: string, fallbackName?: string) {
  const value = process.env[name]?.trim() || (fallbackName ? process.env[fallbackName]?.trim() : '')
  if (!value) throw new UploadApiError(503, 'Tính năng gửi ảnh đang chờ kết nối Supabase Storage.')
  return value
}

/**
 * Local development (Supabase CLI in Docker) runs over plain http on a loopback
 * or private-LAN address. Production always uses https, so this never relaxes it.
 */
export function isLocalDevelopmentUrl(value: string) {
  try {
    const url = new URL(value)
    if (url.protocol !== 'http:') return false
    return /^(?:localhost|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+)$/.test(url.hostname)
  } catch { return false }
}

export function loadSupabaseStorageEnvironment(): SupabaseStorageEnvironment {
  const url = required('SUPABASE_URL', 'VITE_SUPABASE_URL')
  if (!url.startsWith('https://') && !isLocalDevelopmentUrl(url)) throw new UploadApiError(503, 'Cấu hình Supabase Storage không hợp lệ.')
  return { url: url.replace(/\/$/, ''), serviceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY') }
}

function splitFilename(filename: string) {
  const dot = filename.lastIndexOf('.')
  return dot > 0 ? { base: filename.slice(0, dot), extension: filename.slice(dot).toLowerCase() } : { base: filename, extension: '' }
}

export function objectPathForUpload(metadata: UploadMetadata) {
  const { base, extension } = splitFilename(metadata.filename)
  const safeBase = base.replace(/[^\p{L}\p{N} _.-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 90) || 'photo'
  const folder = metadata.variant === 'thumbnail' ? `${THUMBNAIL_FOLDER}/` : metadata.variant === 'preview' ? `${PREVIEW_FOLDER}/` : ''
  return `${metadata.phone}/${folder}${safeBase}--${metadata.requestId}${extension}`
}

/** `0901234567/a--req.png` → `0901234567/_thumbs/a--req-thumb.jpg` (same naming as a thumbnail upload). */
export function thumbnailPathFor(originalPath: string) {
  const slash = originalPath.indexOf('/')
  const name = originalPath.slice(slash + 1)
  const dot = name.lastIndexOf('.')
  return `${originalPath.slice(0, slash)}/${THUMBNAIL_FOLDER}/${dot > 0 ? name.slice(0, dot) : name}-thumb.jpg`
}

/** `0901234567/a--req.png` → `0901234567/_previews/a--req-preview.jpg` (same naming as a preview upload). */
export function previewPathFor(originalPath: string) {
  const slash = originalPath.indexOf('/')
  const name = originalPath.slice(slash + 1)
  const dot = name.lastIndexOf('.')
  return `${originalPath.slice(0, slash)}/${PREVIEW_FOLDER}/${dot > 0 ? name.slice(0, dot) : name}-preview.jpg`
}

function encodedObjectPath(path: string) {
  return path.split('/').map(encodeURIComponent).join('/')
}

// Uploads authorised by a signed-upload token (`x-signature`) must use the
// `/upload/resumable/sign` route. The plain `/upload/resumable` route expects an
// Authorization JWT and answers 400 "Invalid Compact JWS" — the cause of every
// STORAGE_TUS_CREATE_400 seen in production (1,085 in 30 days).
export function resumableEndpoint(projectUrl: string) {
  if (isLocalDevelopmentUrl(projectUrl)) return `${projectUrl.replace(/\/$/, '')}/storage/v1/upload/resumable/sign`
  const url = new URL(projectUrl)
  const projectId = url.hostname.split('.')[0]
  return `https://${projectId}.storage.supabase.co/storage/v1/upload/resumable/sign`
}

export class SupabasePhotoUploadService {
  private readonly client: StorageClient

  constructor(private readonly environment: SupabaseStorageEnvironment, client?: StorageClient, private readonly fetchImpl: typeof fetch = fetch) {
    this.client = client ?? createClient(environment.url, environment.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    }) as StorageClient
  }

  async createSignedUpload(metadata: UploadMetadata) {
    return this.createSignedUploadAt(objectPathForUpload(metadata), metadata)
  }

  /** Signed upload for an explicit object path (booth uploads choose their own path). */
  async createSignedUploadAt(objectPath: string, metadata: UploadMetadata) {
    const existing = await this.client.storage.from(customerPhotoBucket).exists(objectPath)
    if (existing.data) {
      await this.verifyUploadedObjectAt(metadata, objectPath)
      return { alreadyUploaded: true as const, objectPath }
    }

    // storage-js deliberately returns data:false plus a 400/404 error when HEAD
    // confirms that an object is absent. That is the expected first-upload state.
    if (existing.error && (existing.error.status === undefined || ![400, 404].includes(existing.error.status))) {
      throw new UploadApiError(502, 'Supabase Storage chưa thể kiểm tra ảnh. Vui lòng thử lại.')
    }

    const signed = await this.client.storage.from(customerPhotoBucket).createSignedUploadUrl(objectPath, { upsert: false })
    if (signed.error || !signed.data?.signedUrl) throw new UploadApiError(502, 'Không thể chuẩn bị phiên gửi ảnh an toàn. Vui lòng thử lại.')
    const signedUrl = new URL(signed.data.signedUrl)
    const uploadToken = signed.data.token ?? signedUrl.searchParams.get('token')
    const expectedHost = new URL(this.environment.url).host
    const expectedProtocol = isLocalDevelopmentUrl(this.environment.url) ? 'http:' : 'https:'
    if (signedUrl.protocol !== expectedProtocol || signedUrl.host !== expectedHost || !signedUrl.pathname.includes(`/storage/v1/object/upload/sign/${customerPhotoBucket}/`)) {
      throw new UploadApiError(502, 'Supabase Storage không trả về phiên gửi ảnh an toàn.')
    }
    if (!uploadToken) throw new UploadApiError(502, 'Supabase Storage không trả về token gửi ảnh an toàn.')
    return { alreadyUploaded: false as const, objectPath, uploadUrl: signedUrl.toString(), uploadToken, resumableEndpoint: resumableEndpoint(this.environment.url) }
  }

  async verifyUploadedObject(metadata: UploadMetadata, objectPath: string) {
    if (objectPath !== objectPathForUpload(metadata)) throw new UploadApiError(403, 'Đường dẫn ảnh không hợp lệ.')
    return this.verifyUploadedObjectAt(metadata, objectPath)
  }

  /** True when an object exists at the path (HEAD). Absent objects come back as data:false + 400/404. */
  async objectExists(objectPath: string) {
    const existing = await this.client.storage.from(customerPhotoBucket).exists(objectPath)
    if (existing.data) return true
    if (existing.error && (existing.error.status === undefined || ![400, 404].includes(existing.error.status))) {
      throw new UploadApiError(502, 'Supabase Storage chưa thể kiểm tra ảnh. Vui lòng thử lại.')
    }
    return false
  }

  /**
   * Size and type of a stored object from a HEAD request: no body is transferred, so it does not
   * count as Supabase Egress (booth PCs send ~12,000 photos a day). Null when it does not exist.
   */
  async objectHead(objectPath: string) {
    const response = await this.fetchImpl(`${this.environment.url}/storage/v1/object/authenticated/${customerPhotoBucket}/${encodedObjectPath(objectPath)}`, {
      method: 'HEAD',
      headers: { apikey: this.environment.serviceRoleKey, Authorization: `Bearer ${this.environment.serviceRoleKey}` },
    })
    if (response.status === 404 || response.status === 400) return null
    if (!response.ok) throw new UploadApiError(502, 'Supabase Storage chưa thể kiểm tra ảnh. Vui lòng thử lại.')
    const size = Number(response.headers.get('content-length'))
    return { size: Number.isFinite(size) ? size : -1, contentType: response.headers.get('content-type')?.split(';')[0]?.trim() ?? '' }
  }

  /**
   * Booth completion: the authenticated booth PC hashed the file itself, so the server only checks
   * the stored object's size and type (HEAD, no Egress) instead of downloading it again.
   */
  async verifyBoothObjectAt(metadata: { size: number; mimeType: string }, objectPath: string) {
    const head = await this.objectHead(objectPath)
    if (!head) throw new UploadApiError(409, 'Supabase Storage chưa xác nhận đầy đủ ảnh. Vui lòng thử lại.')
    if (head.size !== metadata.size || head.contentType !== metadata.mimeType) throw new UploadApiError(409, 'Dung lượng ảnh đã nhận không khớp.')
    return { objectPath, size: head.size }
  }

  /** SHA-256 of a stored object, or null when it does not exist. */
  async objectSha256(objectPath: string) {
    if (!await this.objectExists(objectPath)) return null
    const response = await this.fetchImpl(`${this.environment.url}/storage/v1/object/authenticated/${customerPhotoBucket}/${encodedObjectPath(objectPath)}`, {
      headers: { apikey: this.environment.serviceRoleKey, Authorization: `Bearer ${this.environment.serviceRoleKey}` },
    })
    if (response.status === 404 || response.status === 400) return null
    if (!response.ok) throw new UploadApiError(502, 'Supabase Storage chưa thể kiểm tra ảnh. Vui lòng thử lại.')
    return createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex')
  }

  async verifyUploadedObjectAt(metadata: UploadMetadata, objectPath: string) {
    const objectUrl = `${this.environment.url}/storage/v1/object/authenticated/${customerPhotoBucket}/${encodedObjectPath(objectPath)}`
    const startedAt = performance.now()
    const response = await this.fetchImpl(objectUrl, {
      headers: { apikey: this.environment.serviceRoleKey, Authorization: `Bearer ${this.environment.serviceRoleKey}` },
    })
    const responseAt = performance.now()
    if (!response.ok || !response.body) throw new UploadApiError(409, 'Supabase Storage chưa xác nhận đầy đủ ảnh. Vui lòng thử lại.')

    const hash = createHash('sha256')
    const reader = response.body.getReader()
    let received = 0
    let prefix = Buffer.alloc(0)
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      received += value.byteLength
      if (received > metadata.size || received > 25 * 1024 * 1024) {
        await reader.cancel()
        throw new UploadApiError(409, 'Dung lượng ảnh đã nhận không khớp.')
      }
      hash.update(value)
      if (prefix.length < 16) prefix = Buffer.concat([prefix, Buffer.from(value).subarray(0, 16 - prefix.length)])
    }
    const contentType = response.headers.get('content-type')?.split(';')[0]?.trim()
    const signatureMatches = hasValidImageSignature(prefix.toString('base64'), metadata.mimeType)
    if (received !== metadata.size || hash.digest('hex') !== metadata.sha256 || contentType !== metadata.mimeType || !signatureMatches) {
      throw new UploadApiError(409, 'Nội dung ảnh đã nhận không khớp bản gốc.')
    }
    return { objectPath, size: received, sha256: metadata.sha256, timing: { storageResponseMs: Math.round(responseAt - startedAt), streamVerificationMs: Math.round(performance.now() - responseAt) } }
  }
}
