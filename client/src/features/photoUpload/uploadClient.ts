import { normalizeVietnamesePhone, supportedImageMime } from './validation'

export interface UploadProgress { loaded: number; total: number }

interface InitResponse {
  alreadyUploaded?: boolean
  objectPath: string
  uploadUrl?: string
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

export async function sha256Blob(blob: Blob) {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function uploadOriginalFile(uploadUrl: string, file: File, onProgress: (progress: UploadProgress) => void) {
  return new Promise<string>((resolve, reject) => {
    const request = new XMLHttpRequest()
    request.open('PUT', uploadUrl)
    request.setRequestHeader('x-upsert', 'false')
    request.upload.onprogress = (event) => onProgress({ loaded: event.loaded, total: event.lengthComputable ? event.total : file.size })
    request.onerror = () => reject(new Error('Kết nối tải ảnh bị gián đoạn. Vui lòng thử lại.'))
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
  const init = await fetch('/api/photo-uploads/init', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: normalizeVietnamesePhone(input.phone), filename: input.file.name, mimeType, size: input.file.size, prefix, sha256: checksum, requestId: input.requestId }),
  })
  const prepared = await jsonOrError(init) as InitResponse
  if (!prepared.alreadyUploaded) await uploadOriginalFile(prepared.uploadUrl ?? '', input.file, input.onProgress)
  const completion = await fetch('/api/photo-uploads/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: normalizeVietnamesePhone(input.phone), filename: input.file.name, objectPath: prepared.objectPath, mimeType, size: input.file.size, prefix, sha256: checksum, requestId: input.requestId }),
  })
  await jsonOrError(completion)
  input.onProgress({ loaded: input.file.size, total: input.file.size })
}
