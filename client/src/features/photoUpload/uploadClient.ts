import { normalizeVietnamesePhone, supportedImageMime } from './validation'

export interface UploadProgress { loaded: number; total: number }

interface InitResponse {
  alreadyUploaded?: boolean
  objectPath: string
  uploadUrl?: string
}

const API_TIMEOUT_MS = 30_000
const UPLOAD_TIMEOUT_MS = 120_000

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

export async function uploadPhotoToStorage(input: { file: File; phone: string; requestId: string; onProgress: (progress: UploadProgress) => void }) {
  const mimeType = supportedImageMime(input.file)
  if (!mimeType) throw new Error('Chỉ hỗ trợ ảnh PNG, JPG và JPEG.')
  const [prefix, checksum] = await Promise.all([
    input.file.slice(0, 16).arrayBuffer().then((buffer) => bytesToBase64(new Uint8Array(buffer))),
    sha256Blob(input.file),
  ])
  const init = await fetchWithTimeout('/api/photo-uploads/init', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: normalizeVietnamesePhone(input.phone), filename: input.file.name, mimeType, size: input.file.size, prefix, sha256: checksum, requestId: input.requestId }),
  }, 'Chuẩn bị gửi ảnh quá thời gian chờ. Vui lòng thử lại.')
  const prepared = await jsonOrError(init) as InitResponse
  if (!prepared.alreadyUploaded) {
    if (!prepared.uploadUrl) throw new Error('Không nhận được phiên gửi ảnh an toàn. Vui lòng thử lại.')
    await uploadOriginalFile(prepared.uploadUrl, input.file, input.onProgress)
  }
  const completion = await fetchWithTimeout('/api/photo-uploads/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: normalizeVietnamesePhone(input.phone), filename: input.file.name, objectPath: prepared.objectPath, mimeType, size: input.file.size, prefix, sha256: checksum, requestId: input.requestId }),
  }, 'Xác minh ảnh quá thời gian chờ. Ảnh vẫn được giữ để bạn thử lại.')
  await jsonOrError(completion)
  input.onProgress({ loaded: input.file.size, total: input.file.size })
}
