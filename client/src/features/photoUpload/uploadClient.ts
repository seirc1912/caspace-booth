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
  completionToken: string
  objectPath: string
  resumableEndpoint?: string
  uploadToken?: string
  uploadUrl?: string
}

const API_TIMEOUT_MS = 30_000
const UPLOAD_TIMEOUT_MS = 5 * 60_000
const uploadSessionStorageKey = 'caspace.photo-upload-session.v1'
let uploadSessionRequest: Promise<string> | null = null
let uploadSessionValue: string | null = null
export const RESUMABLE_UPLOAD_THRESHOLD_BYTES = 6 * 1024 * 1024
export const RESUMABLE_CHUNK_BYTES = 6 * 1024 * 1024
export const MAX_UPLOAD_CONCURRENCY = 1

export interface UploadTiming {
  finalizationMs: number
  hashMs: number
  initializationMs: number
  totalMs: number
  transferMs: number
  transport: 'existing' | 'standard' | 'tus'
  verificationMs: number
}

function storedUploadSession() {
  if (uploadSessionValue) return uploadSessionValue
  try {
    const existing = sessionStorage.getItem(uploadSessionStorageKey)
    return existing?.startsWith('v1.') ? existing : null
  } catch { return null }
}

function clearUploadSession() {
  uploadSessionValue = null
  try { sessionStorage.removeItem(uploadSessionStorageKey) } catch { /* private-mode storage may be unavailable */ }
}

async function uploadSession(forceRefresh = false) {
  if (forceRefresh) clearUploadSession()
  const existing = storedUploadSession()
  if (existing) return existing
  if (!uploadSessionRequest) uploadSessionRequest = fetchWithTimeout('/api/photo-uploads/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  }, 'Khởi tạo phiên gửi ảnh quá thời gian chờ. Vui lòng thử lại.').then(async (response) => {
    const body = await jsonOrError(response) as { token?: string }
    if (!body.token?.startsWith('v1.')) throw new Error('Không nhận được phiên gửi ảnh an toàn. Vui lòng thử lại.')
    uploadSessionValue = body.token
    try { sessionStorage.setItem(uploadSessionStorageKey, body.token) } catch { /* keep the in-memory result */ }
    return body.token
  }).finally(() => { uploadSessionRequest = null })
  return uploadSessionRequest
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

async function uploadApi(path: string, body: string, timeoutMessage: string, refreshOnUnauthorized = true) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const token = await uploadSession(attempt > 0)
    const response = await fetchWithTimeout(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Upload-Session': token },
      body,
    }, timeoutMessage)
    if (response.status !== 401 || attempt > 0 || !refreshOnUnauthorized) return response
  }
  throw new Error('Không thể khởi tạo lại phiên gửi ảnh.')
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

export async function runUploadQueue<T>(items: readonly T[], worker: (item: T, index: number) => Promise<void>) {
  for (let index = 0; index < items.length; index += 1) {
    try { await worker(items[index]!, index) }
    catch (reason) { return [{ index, reason }] }
  }
  return []
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
  const initializationStartedAt = performance.now()
  const metadata = JSON.stringify({ phone: normalizeVietnamesePhone(input.phone), filename: input.file.name, mimeType, size: input.file.size, prefix, sha256: checksum, requestId: input.requestId })
  const init = await uploadApi('/api/photo-uploads/init', metadata, 'Chuẩn bị gửi ảnh quá thời gian chờ. Vui lòng thử lại.')
  let prepared = await jsonOrError(init) as InitResponse
  if (!prepared.completionToken) throw new Error('Không nhận được phiên xác minh ảnh an toàn. Vui lòng thử lại.')
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
  const completionBody = () => JSON.stringify({ phone: normalizeVietnamesePhone(input.phone), filename: input.file.name, objectPath: prepared.objectPath, mimeType, size: input.file.size, prefix, sha256: checksum, requestId: input.requestId, completionToken: prepared.completionToken })
  let completion = await uploadApi('/api/photo-uploads/complete', completionBody(), 'Xác minh ảnh quá thời gian chờ. Ảnh vẫn được giữ để bạn thử lại.', false)
  if (completion.status === 401) {
    clearUploadSession()
    const refreshedInit = await uploadApi('/api/photo-uploads/init', metadata, 'Khởi tạo lại phiên gửi ảnh quá thời gian chờ. Vui lòng thử lại.')
    prepared = await jsonOrError(refreshedInit) as InitResponse
    if (!prepared.completionToken) throw new Error('Không nhận được phiên xác minh ảnh an toàn. Vui lòng thử lại.')
    completion = await uploadApi('/api/photo-uploads/complete', completionBody(), 'Xác minh ảnh quá thời gian chờ. Ảnh vẫn được giữ để bạn thử lại.', false)
  }
  await jsonOrError(completion)
  const verificationMs = performance.now() - verificationStartedAt
  input.onProgress({ loaded: input.file.size, total: input.file.size })
  const timing: UploadTiming = { finalizationMs: 0, hashMs: Math.round(hashMs), initializationMs: Math.round(initializationMs), totalMs: Math.round(performance.now() - totalStartedAt), transferMs: Math.round(transferMs), transport, verificationMs: Math.round(verificationMs) }
  input.onTiming?.(timing)
  if (!input.onTiming) console.info('[photo-upload:timing]', timing)
}
