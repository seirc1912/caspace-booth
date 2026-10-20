import { normalizeVietnamesePhone, supportedImageMime } from './validation'
import type { Upload as TusUpload } from 'tus-js-client'

export interface UploadProgress { loaded: number; total: number }

export function calculateOverallUploadProgress(files: Array<{ size: number; uploadedBytes: number }>) {
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0)
  if (!totalBytes) return 0
  const uploadedBytes = files.reduce((sum, file) => sum + Math.max(0, Math.min(file.size, file.uploadedBytes)), 0)
  return Math.min(100, Math.round((uploadedBytes / totalBytes) * 100))
}

interface InitResponse {
  alreadyUploaded?: boolean
  objectPath: string
  resumableEndpoint?: string
  uploadToken?: string
  uploadUrl?: string
}

const API_TIMEOUT_MS = 30_000
const UPLOAD_TIMEOUT_MS = 5 * 60_000
export const RESUMABLE_UPLOAD_THRESHOLD_BYTES = 6 * 1024 * 1024
export const RESUMABLE_CHUNK_BYTES = 6 * 1024 * 1024

export interface UploadTiming {
  finalizationMs: number
  hashMs: number
  initializationMs: number
  totalMs: number
  transferMs: number
  transport: 'existing' | 'standard' | 'tus'
  verificationMs: number
}

function uploadClientId() {
  const key = 'caspace.photo-upload-client.v1'
  try {
    const existing = sessionStorage.getItem(key)
    if (existing) return existing
    const created = crypto.randomUUID()
    sessionStorage.setItem(key, created)
    return created
  } catch { return crypto.randomUUID() }
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

async function jsonOrError(response: Response) {
  const body = await response.json().catch(() => ({})) as { error?: string }
  if (!response.ok) throw new Error(body.error ?? 'Không thể chuẩn bị tải ảnh lên.')
  return body
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit, message: string) {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), API_TIMEOUT_MS)
  try {
    return await fetch(input, { ...init, signal: controller.signal })
  } catch (reason) {
    if (reason instanceof DOMException && reason.name === 'AbortError') throw new Error(message, { cause: reason })
    throw reason
  } finally {
    window.clearTimeout(timeout)
  }
}

export async function sha256Blob(blob: Blob) {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function uploadOriginalFile(uploadUrl: string, file: File, onProgress: (progress: UploadProgress) => void) {
  return new Promise<string>((resolve, reject) => {
    const request = new XMLHttpRequest()
    request.open('PUT', uploadUrl)
    request.timeout = UPLOAD_TIMEOUT_MS
    request.setRequestHeader('x-upsert', 'false')
    request.upload.onprogress = (event) => onProgress({ loaded: event.loaded, total: event.lengthComputable ? event.total : file.size })
    request.onerror = () => reject(new Error('Kết nối tải ảnh bị gián đoạn. Vui lòng thử lại.'))
    request.onabort = () => reject(new Error('Đã hủy gửi ảnh.'))
    request.ontimeout = () => reject(new Error('Gửi ảnh quá thời gian chờ. Vui lòng kiểm tra mạng và thử lại.'))
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) resolve('ok')
      else reject(new Error('Supabase Storage chưa nhận được ảnh. Vui lòng thử lại.'))
    }
    const body = new FormData()
    body.append('cacheControl', '3600')
    body.append('', file, file.name)
    request.send(body)
  })
}

async function uploadResumableFile(input: { contentType: string; endpoint: string; file: File; objectPath: string; onProgress: (progress: UploadProgress) => void; token: string }) {
  const { Upload, isSupported } = await import('tus-js-client')
  if (!isSupported) throw new Error('Trình duyệt này chưa hỗ trợ gửi ảnh có thể tiếp tục. Vui lòng dùng Safari hoặc Chrome mới nhất.')
  await new Promise<void>((resolve, reject) => {
    let settled = false
    let inactivityTimer = 0
    const finish = (callback: () => void) => {
      if (settled) return
      settled = true
      window.clearTimeout(inactivityTimer)
      callback()
    }
    const refreshInactivityTimer = (upload: TusUpload) => {
      window.clearTimeout(inactivityTimer)
      inactivityTimer = window.setTimeout(() => {
        void upload.abort().finally(() => finish(() => reject(new Error('Gửi ảnh tạm dừng quá lâu. Vui lòng kiểm tra mạng và thử lại để tiếp tục.'))))
      }, UPLOAD_TIMEOUT_MS)
    }
    const upload = new Upload(input.file, {
      endpoint: input.endpoint,
      chunkSize: RESUMABLE_CHUNK_BYTES,
      retryDelays: [0, 1_000, 3_000, 5_000, 10_000],
      headers: { 'x-signature': input.token, 'x-upsert': 'false' },
      metadata: { bucketName: 'customer-photo-uploads', objectName: input.objectPath, contentType: input.contentType, cacheControl: '3600' },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      onError: (reason) => finish(() => reject(new Error('Không thể tiếp tục gửi ảnh. Vui lòng thử lại trên kết nối ổn định.', { cause: reason }))),
      onProgress: (loaded, total) => { refreshInactivityTimer(upload); input.onProgress({ loaded, total }) },
      onSuccess: () => finish(resolve),
    })
    refreshInactivityTimer(upload)
    void upload.findPreviousUploads().then((previous) => {
      if (previous[0]) upload.resumeFromPreviousUpload(previous[0])
      upload.start()
    }).catch((reason) => finish(() => reject(reason)))
  })
}

export function recommendedUploadConcurrency(connection?: { effectiveType?: string; saveData?: boolean }) {
  return connection?.saveData || connection?.effectiveType === 'slow-2g' || connection?.effectiveType === '2g' ? 1 : 2
}

export async function runUploadQueue<T>(items: readonly T[], worker: (item: T, index: number) => Promise<void>, concurrency: number) {
  let nextIndex = 0
  const failures: Array<{ index: number; reason: unknown }> = []
  const run = async () => {
    while (true) {
      const index = nextIndex++
      if (index >= items.length) return
      try { await worker(items[index]!, index) }
      catch (reason) { failures.push({ index, reason }) }
    }
  }
  await Promise.all(Array.from({ length: Math.min(Math.max(1, concurrency), items.length) }, run))
  return failures.sort((left, right) => left.index - right.index)
}

export async function uploadPhotoToStorage(input: { file: File; phone: string; requestId: string; onProgress: (progress: UploadProgress) => void; onTiming?: (timing: UploadTiming) => void }) {
  const totalStartedAt = performance.now()
  const mimeType = supportedImageMime(input.file)
  if (!mimeType) throw new Error('Chỉ hỗ trợ ảnh PNG, JPG và JPEG.')
  const hashStartedAt = performance.now()
  const [prefix, checksum] = await Promise.all([
    input.file.slice(0, 16).arrayBuffer().then((buffer) => bytesToBase64(new Uint8Array(buffer))),
    sha256Blob(input.file),
  ])
  const hashMs = performance.now() - hashStartedAt
  const clientId = uploadClientId()
  const initializationStartedAt = performance.now()
  const init = await fetchWithTimeout('/api/photo-uploads/init', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Upload-Client-Id': clientId },
    body: JSON.stringify({ phone: normalizeVietnamesePhone(input.phone), filename: input.file.name, mimeType, size: input.file.size, prefix, sha256: checksum, requestId: input.requestId }),
  }, 'Chuẩn bị gửi ảnh quá thời gian chờ. Vui lòng thử lại.')
  const prepared = await jsonOrError(init) as InitResponse
  const initializationMs = performance.now() - initializationStartedAt
  let transport: UploadTiming['transport'] = 'existing'
  const transferStartedAt = performance.now()
  if (!prepared.alreadyUploaded) {
    if (!prepared.uploadUrl) throw new Error('Không nhận được phiên gửi ảnh an toàn. Vui lòng thử lại.')
    if (input.file.size > RESUMABLE_UPLOAD_THRESHOLD_BYTES) {
      if (!prepared.uploadToken || !prepared.resumableEndpoint) throw new Error('Không nhận được phiên gửi ảnh có thể tiếp tục. Vui lòng thử lại.')
      transport = 'tus'
      await uploadResumableFile({ contentType: mimeType, endpoint: prepared.resumableEndpoint, file: input.file, objectPath: prepared.objectPath, onProgress: input.onProgress, token: prepared.uploadToken })
    } else {
      transport = 'standard'
      await uploadOriginalFile(prepared.uploadUrl, input.file, input.onProgress)
    }
  }
  const transferMs = performance.now() - transferStartedAt
  const verificationStartedAt = performance.now()
  const completion = await fetchWithTimeout('/api/photo-uploads/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Upload-Client-Id': clientId },
    body: JSON.stringify({ phone: normalizeVietnamesePhone(input.phone), filename: input.file.name, objectPath: prepared.objectPath, mimeType, size: input.file.size, prefix, sha256: checksum, requestId: input.requestId }),
  }, 'Xác minh ảnh quá thời gian chờ. Ảnh vẫn được giữ để bạn thử lại.')
  await jsonOrError(completion)
  const verificationMs = performance.now() - verificationStartedAt
  input.onProgress({ loaded: input.file.size, total: input.file.size })
  const timing: UploadTiming = { finalizationMs: 0, hashMs: Math.round(hashMs), initializationMs: Math.round(initializationMs), totalMs: Math.round(performance.now() - totalStartedAt), transferMs: Math.round(transferMs), transport, verificationMs: Math.round(verificationMs) }
  input.onTiming?.(timing)
  if (!input.onTiming) console.info('[photo-upload:timing]', timing)
}
