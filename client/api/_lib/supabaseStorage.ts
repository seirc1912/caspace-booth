import { createHash } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { UploadApiError } from './http.js'
import { hasValidImageSignature, type UploadMetadata } from './uploadValidation.js'

export const customerPhotoBucket = 'customer-photo-uploads'

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

export function loadSupabaseStorageEnvironment(): SupabaseStorageEnvironment {
  const url = required('SUPABASE_URL', 'VITE_SUPABASE_URL')
  if (!url.startsWith('https://')) throw new UploadApiError(503, 'Cấu hình Supabase Storage không hợp lệ.')
  return { url: url.replace(/\/$/, ''), serviceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY') }
}

function splitFilename(filename: string) {
  const dot = filename.lastIndexOf('.')
  return dot > 0 ? { base: filename.slice(0, dot), extension: filename.slice(dot).toLowerCase() } : { base: filename, extension: '' }
}

export function objectPathForUpload(metadata: UploadMetadata) {
  const { base, extension } = splitFilename(metadata.filename)
  const safeBase = base.replace(/[^\p{L}\p{N} _.-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 90) || 'photo'
  return `${metadata.phone}/${safeBase}--${metadata.requestId}${extension}`
}

function encodedObjectPath(path: string) {
  return path.split('/').map(encodeURIComponent).join('/')
}

function resumableEndpoint(projectUrl: string) {
  const url = new URL(projectUrl)
  const projectId = url.hostname.split('.')[0]
  return `https://${projectId}.storage.supabase.co/storage/v1/upload/resumable`
}

export class SupabasePhotoUploadService {
  private readonly client: StorageClient

  constructor(private readonly environment: SupabaseStorageEnvironment, client?: StorageClient, private readonly fetchImpl: typeof fetch = fetch) {
    this.client = client ?? createClient(environment.url, environment.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    }) as StorageClient
  }

  async createSignedUpload(metadata: UploadMetadata) {
    const objectPath = objectPathForUpload(metadata)
    const existing = await this.client.storage.from(customerPhotoBucket).exists(objectPath)
    if (existing.data) {
      await this.verifyUploadedObject(metadata, objectPath)
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
    if (signedUrl.protocol !== 'https:' || signedUrl.host !== expectedHost || !signedUrl.pathname.includes(`/storage/v1/object/upload/sign/${customerPhotoBucket}/`)) {
      throw new UploadApiError(502, 'Supabase Storage không trả về phiên gửi ảnh an toàn.')
    }
    if (!uploadToken) throw new UploadApiError(502, 'Supabase Storage không trả về token gửi ảnh an toàn.')
    return { alreadyUploaded: false as const, objectPath, uploadUrl: signedUrl.toString(), uploadToken, resumableEndpoint: resumableEndpoint(this.environment.url) }
  }

  async verifyUploadedObject(metadata: UploadMetadata, objectPath: string) {
    if (objectPath !== objectPathForUpload(metadata)) throw new UploadApiError(403, 'Đường dẫn ảnh không hợp lệ.')
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
