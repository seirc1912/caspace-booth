import { normalizeVietnamesePhone, supportedImageMime } from './validation'
import type { DetailedError, Upload as TusUpload } from 'tus-js-client'

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
// Standard upload: fail fast when no byte moves for this long (instead of a fixed
// 5-minute wait), then retry automatically on network-type failures.
export const UPLOAD_STALL_TIMEOUT_MS = 45_000
export const UPLOAD_HARD_TIMEOUT_MS = 10 * 60_000
export const STANDARD_UPLOAD_RETRY_DELAYS_MS = [1_000, 3_000, 8_000]
export const TUS_STALL_RESTARTS = 3
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
  /** TUS failed and the file was re-sent through the standard signed upload. */
  tusFallback: boolean
  /** Automatic standard-upload retries that were needed for this file. */
  transferRetries: number
  verificationMs: number
}

export type UploadFailureStage = 'hash' | 'init' | 'standard-transfer' | 'tus-create' | 'tus-resume' | 'tus-transfer' | 'verification'

interface UploadFailureDiagnostic {
  code: string
  correlationId: string
  durationMs: number
  retryCount: number
  stage: UploadFailureStage
  status: number
  transport: 'api' | 'standard' | 'tus'
}

class UploadStageError extends Error {
  readonly diagnostic: UploadFailureDiagnostic
  constructor(message: string, diagnostic: UploadFailureDiagnostic, options?: ErrorOptions) {
    super(message, options)
    this.diagnostic = diagnostic
  }
}

function uploadErrorMessage(status: number) {
  if (status === 401 || status === 403) return 'Phiên gửi ảnh đã hết hạn hoặc không còn hợp lệ. Vui lòng thử lại ảnh này.'
  if (status === 404) return 'Phiên gửi ảnh cũ không còn tồn tại. Vui lòng thử lại ảnh này.'
  if (status === 409) return 'Ảnh đang có một phiên gửi khác. Vui lòng thử lại ảnh này.'
  if (status === 413) return 'Ảnh vượt quá giới hạn dung lượng cho phép.'
  if (status === 429) return 'Hệ thống đang nhận quá nhiều ảnh. Vui lòng chờ một lát rồi thử lại ảnh này.'
  if (status >= 500) return 'Kho ảnh đang tạm thời gián đoạn. Vui lòng thử lại ảnh này.'
  return 'Không thể gửi ảnh này đến kho lưu trữ. Vui lòng thử lại.'
}

export function classifyTusFailure(reason: unknown, input: Omit<UploadFailureDiagnostic, 'code' | 'stage' | 'status'>) {
  const detailed = reason as Partial<DetailedError> | undefined
  const status = detailed?.originalResponse?.getStatus?.() ?? 0
  const method = detailed?.originalRequest?.getMethod?.()
  const stage: UploadFailureStage = method === 'POST' ? 'tus-create' : method === 'HEAD' ? 'tus-resume' : 'tus-transfer'
  const code = status ? `STORAGE_TUS_${stage.replace('tus-', '').toUpperCase()}_${status}` : 'STORAGE_TUS_NETWORK'
  return new UploadStageError(uploadErrorMessage(status), { ...input, code, stage, status }, { cause: reason })
}

export function isFreshTusUpload(candidate: { creationTime: string; uploadUrl: string | null }, endpoint: string, now = Date.now()) {
  if (!candidate.uploadUrl) return false
  try {
    const createdAt = Date.parse(candidate.creationTime)
    return Number.isFinite(createdAt) && now - createdAt >= 0 && now - createdAt < 23 * 60 * 60_000 && new URL(candidate.uploadUrl).origin === new URL(endpoint).origin
  } catch { return false }
}

// Shared by failure diagnostics and client timing telemetry. Never throws:
// diagnostics must never block a customer upload, save or retry.
export async function sendUploadDiagnostic(payload: object) {
  try {
    const token = await uploadSession()
    await fetchWithTimeout('/api/photo-uploads/diagnostics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Upload-Session': token },
      body: JSON.stringify(payload),
      keepalive: true,
    }, 'diagnostic timeout')
  } catch { /* best effort only */ }
}

// Thumbnail uploads are best effort; their failures must not be counted as
// customer upload failures in [photo-upload:failure].
const silentCorrelationIds = new Set<string>()

async function reportUploadFailure(diagnostic: UploadFailureDiagnostic) {
  if (silentCorrelationIds.has(diagnostic.correlationId)) return
  await sendUploadDiagnostic(diagnostic)
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

function uploadCorrelationId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
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

async function uploadApiResult(response: Response, stage: 'init' | 'verification', correlationId: string, startedAt: number) {
  if (response.ok) return jsonOrError(response)
  const body = await response.json().catch(() => ({})) as { error?: string }
  const diagnostic: UploadFailureDiagnostic = {
    code: `UPLOAD_${stage.toUpperCase()}_${response.status || 'NETWORK'}`,
    correlationId,
    durationMs: Math.round(performance.now() - startedAt),
    retryCount: 0,
    stage,
    status: response.status,
    transport: 'api',
  }
  await reportUploadFailure(diagnostic)
  throw new UploadStageError(body.error ?? (stage === 'init' ? 'Không thể chuẩn bị tải ảnh lên.' : 'Không thể xác minh ảnh đã gửi.'), diagnostic)
}

export async function sha256Blob(blob: Blob) {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

type StandardAttemptResult = 'ok' | 'exists'

export function isRetryableUploadStatus(status: number) {
  return status === 0 || status === 408 || status === 429 || status >= 500
}

/** A retry may hit an object the previous (lost) response already stored; verification proves its bytes. */
export function isDuplicateUploadResponse(status: number, body: string) {
  return status === 409 || (status === 400 && /duplicate|already exists/i.test(body))
}

function uploadOriginalFileOnce(uploadUrl: string, file: File, onProgress: (progress: UploadProgress) => void, correlationId: string, retryCount: number, mayAlreadyExist: boolean) {
  return new Promise<StandardAttemptResult>((resolve, reject) => {
    const startedAt = performance.now()
    const request = new XMLHttpRequest()
    let stallTimer = 0
    let stalled = false
    const armStallTimer = () => {
      window.clearTimeout(stallTimer)
      stallTimer = window.setTimeout(() => { stalled = true; request.abort() }, UPLOAD_STALL_TIMEOUT_MS)
    }
    const fail = (status: number, code: string, message = uploadErrorMessage(status)) => {
      window.clearTimeout(stallTimer)
      reject(new UploadStageError(message, { code, correlationId, durationMs: Math.round(performance.now() - startedAt), retryCount, stage: 'standard-transfer', status, transport: 'standard' }))
    }
    request.open('PUT', uploadUrl)
    request.timeout = UPLOAD_HARD_TIMEOUT_MS
    request.setRequestHeader('x-upsert', 'false')
    request.upload.onprogress = (event) => { armStallTimer(); onProgress({ loaded: event.loaded, total: event.lengthComputable ? event.total : file.size }) }
    request.upload.onload = armStallTimer // body sent; now waiting for Storage's response
    request.onerror = () => fail(0, 'STORAGE_STANDARD_NETWORK')
    request.onabort = () => stalled
      ? fail(0, 'STORAGE_STANDARD_STALL', 'Mạng bị gián đoạn khi gửi ảnh. Vui lòng thử lại ảnh này.')
      : (window.clearTimeout(stallTimer), reject(new Error('Đã hủy gửi ảnh.')))
    request.ontimeout = () => fail(0, 'STORAGE_STANDARD_TIMEOUT', 'Gửi ảnh quá thời gian chờ. Vui lòng thử lại ảnh này.')
    request.onload = () => {
      window.clearTimeout(stallTimer)
      if (request.status >= 200 && request.status < 300) resolve('ok')
      else if ((retryCount > 0 || mayAlreadyExist) && isDuplicateUploadResponse(request.status, request.responseText ?? '')) resolve('exists')
      else fail(request.status, `STORAGE_STANDARD_HTTP_${request.status}`)
    }
    const body = new FormData()
    body.append('cacheControl', '3600')
    body.append('', file, file.name)
    armStallTimer()
    request.send(body)
  })
}

function waitBeforeRetry(delayMs: number) {
  return new Promise<void>((resolve) => {
    const finish = () => { window.clearTimeout(timer); window.removeEventListener('online', finish); resolve() }
    // When the phone is offline, wait for the connection to come back (up to 30 s) instead of a blind delay.
    const timer = window.setTimeout(finish, navigator.onLine === false ? 30_000 : delayMs)
    if (navigator.onLine === false) window.addEventListener('online', finish)
  })
}

/** Signed standard upload with stall detection and automatic retries. Returns how many retries were needed. */
async function uploadOriginalFile(uploadUrl: string, file: File, onProgress: (progress: UploadProgress) => void, correlationId: string, mayAlreadyExist = false) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await uploadOriginalFileOnce(uploadUrl, file, onProgress, correlationId, attempt, mayAlreadyExist)
      return attempt
    } catch (reason) {
      const status = reason instanceof UploadStageError ? reason.diagnostic.status : -1
      if (!(reason instanceof UploadStageError) || !isRetryableUploadStatus(status) || attempt >= STANDARD_UPLOAD_RETRY_DELAYS_MS.length) throw reason
      onProgress({ loaded: 0, total: file.size })
      await waitBeforeRetry(STANDARD_UPLOAD_RETRY_DELAYS_MS[attempt]!)
    }
  }
}

async function uploadResumableFile(input: { contentType: string; correlationId: string; endpoint: string; file: File; objectPath: string; onProgress: (progress: UploadProgress) => void; token: string }) {
  const { Upload, isSupported } = await import('tus-js-client')
  if (!isSupported) throw new Error('Trình duyệt này chưa hỗ trợ gửi ảnh có thể tiếp tục. Vui lòng dùng Safari hoặc Chrome mới nhất.')
  await new Promise<void>((resolve, reject) => {
    let settled = false
    let inactivityTimer = 0
    let requestCount = 0
    const startedAt = performance.now()
    const finish = (callback: () => void) => {
      if (settled) return
      settled = true
      window.clearTimeout(inactivityTimer)
      callback()
    }
    let stallRestarts = 0
    // A stalled TUS transfer is resumed (HEAD + PATCH from the stored offset), not
    // restarted from byte 0 through the standard upload. After 3 stalls the file
    // fails with STORAGE_TUS_STALL; a manual retry resumes from the same offset.
    const refreshInactivityTimer = (upload: TusUpload) => {
      window.clearTimeout(inactivityTimer)
      inactivityTimer = window.setTimeout(() => {
        void upload.abort().finally(() => {
          if (settled) return
          if (stallRestarts < TUS_STALL_RESTARTS) { stallRestarts += 1; refreshInactivityTimer(upload); upload.start(); return }
          finish(() => reject(new UploadStageError('Mạng bị gián đoạn khi gửi ảnh. Vui lòng thử lại ảnh này để gửi tiếp.', { code: 'STORAGE_TUS_STALL', correlationId: input.correlationId, durationMs: Math.round(performance.now() - startedAt), retryCount: stallRestarts, stage: 'tus-transfer', status: 0, transport: 'tus' })))
        })
      }, UPLOAD_STALL_TIMEOUT_MS)
    }
    const upload = new Upload(input.file, {
      endpoint: input.endpoint,
      chunkSize: RESUMABLE_CHUNK_BYTES,
      retryDelays: [0, 1_000, 3_000, 5_000, 10_000],
      headers: { 'x-signature': input.token, 'x-upsert': 'false' },
      metadata: { bucketName: 'customer-photo-uploads', objectName: input.objectPath, contentType: input.contentType, cacheControl: '3600' },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      onError: (reason) => finish(() => reject(classifyTusFailure(reason, { correlationId: input.correlationId, durationMs: Math.round(performance.now() - startedAt), retryCount: Math.max(0, requestCount - 1), transport: 'tus' }))),
      onBeforeRequest: () => { requestCount += 1 },
      onProgress: (loaded, total) => { refreshInactivityTimer(upload); input.onProgress({ loaded, total }) },
      onSuccess: () => finish(resolve),
    })
    refreshInactivityTimer(upload)
    void upload.findPreviousUploads().then((previous) => {
      // tus fingerprints ignore the object path; never resume an upload that targeted another object.
      const resumable = previous.find((candidate) => candidate.metadata?.objectName === input.objectPath && isFreshTusUpload(candidate, input.endpoint))
      if (resumable) upload.resumeFromPreviousUpload(resumable)
      upload.start()
    }).catch((reason) => finish(() => reject(classifyTusFailure(reason, { correlationId: input.correlationId, durationMs: Math.round(performance.now() - startedAt), retryCount: Math.max(0, requestCount - 1), transport: 'tus' }))))
  })
}

/**
 * Runs uploads with at most `concurrency` in flight. A failed photo no longer
 * stops the batch: every photo is attempted and all failures are returned so
 * the customer can retry only the failed ones.
 */
export async function runUploadQueue<T>(items: readonly T[], worker: (item: T, index: number) => Promise<void>, concurrency = MAX_UPLOAD_CONCURRENCY) {
  const failures: Array<{ index: number; reason: unknown }> = []
  let next = 0
  const lane = async () => {
    while (next < items.length) {
      const index = next
      next += 1
      try { await worker(items[index]!, index) }
      catch (reason) { failures.push({ index, reason }) }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, lane))
  return failures.sort((left, right) => left.index - right.index)
}

export async function uploadPhotoToStorage(input: { file: File; phone: string; requestId: string; variant?: 'original' | 'thumbnail'; onProgress: (progress: UploadProgress) => void; onTiming?: (timing: UploadTiming) => void }) {
  const variant = input.variant ?? 'original'
  const correlationId = uploadCorrelationId()
  if (variant === 'thumbnail') silentCorrelationIds.add(correlationId)
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
  const metadata = JSON.stringify({ phone: normalizeVietnamesePhone(input.phone), filename: input.file.name, mimeType, size: input.file.size, prefix, sha256: checksum, requestId: input.requestId, variant })
  const init = await uploadApi('/api/photo-uploads/init', metadata, 'Chuẩn bị gửi ảnh quá thời gian chờ. Vui lòng thử lại.')
  let prepared = await uploadApiResult(init, 'init', correlationId, initializationStartedAt) as InitResponse
  if (!prepared.completionToken) throw new Error('Không nhận được phiên xác minh ảnh an toàn. Vui lòng thử lại.')
  const initializationMs = performance.now() - initializationStartedAt
  let transport: UploadTiming['transport'] = 'existing'
  let tusFallback = false
  let transferRetries = 0
  const transferStartedAt = performance.now()
  if (!prepared.alreadyUploaded) {
    if (!prepared.uploadUrl) throw new Error('Không nhận được phiên gửi ảnh an toàn. Vui lòng thử lại.')
    if (input.file.size > RESUMABLE_UPLOAD_THRESHOLD_BYTES) {
      if (!prepared.uploadToken || !prepared.resumableEndpoint) throw new Error('Không nhận được phiên gửi ảnh có thể tiếp tục. Vui lòng thử lại.')
      transport = 'tus'
      try {
        await uploadResumableFile({ contentType: mimeType, correlationId, endpoint: prepared.resumableEndpoint, file: input.file, objectPath: prepared.objectPath, onProgress: input.onProgress, token: prepared.uploadToken })
      } catch (reason) {
        if (reason instanceof UploadStageError) await reportUploadFailure(reason.diagnostic)
        if (reason instanceof UploadStageError && reason.diagnostic.code === 'STORAGE_TUS_STALL') throw reason // network problem: resume TUS on retry
        // Files are capped at 25 MB. The signed standard upload is the proven
        // pre-TUS path and remains scoped to this exact, non-overwritable object.
        transport = 'standard'
        tusFallback = true
        input.onProgress({ loaded: 0, total: input.file.size })
        // TUS may already have stored the object (lost final response) → a Duplicate answer is accepted and /complete verifies the bytes.
        try { transferRetries = await uploadOriginalFile(prepared.uploadUrl, input.file, input.onProgress, correlationId, true) }
        catch (fallbackReason) {
          if (fallbackReason instanceof UploadStageError) await reportUploadFailure(fallbackReason.diagnostic)
          throw fallbackReason
        }
      }
    } else {
      transport = 'standard'
      try { transferRetries = await uploadOriginalFile(prepared.uploadUrl, input.file, input.onProgress, correlationId) }
      catch (reason) {
        if (reason instanceof UploadStageError) await reportUploadFailure(reason.diagnostic)
        throw reason
      }
    }
  }
  const transferMs = performance.now() - transferStartedAt
  const verificationStartedAt = performance.now()
  const completionBody = () => JSON.stringify({ phone: normalizeVietnamesePhone(input.phone), filename: input.file.name, objectPath: prepared.objectPath, mimeType, size: input.file.size, prefix, sha256: checksum, requestId: input.requestId, variant, completionToken: prepared.completionToken })
  let completion = await uploadApi('/api/photo-uploads/complete', completionBody(), 'Xác minh ảnh quá thời gian chờ. Ảnh vẫn được giữ để bạn thử lại.', false)
  if (completion.status === 401) {
    clearUploadSession()
    const refreshedInit = await uploadApi('/api/photo-uploads/init', metadata, 'Khởi tạo lại phiên gửi ảnh quá thời gian chờ. Vui lòng thử lại.')
    prepared = await uploadApiResult(refreshedInit, 'init', correlationId, verificationStartedAt) as InitResponse
    if (!prepared.completionToken) throw new Error('Không nhận được phiên xác minh ảnh an toàn. Vui lòng thử lại.')
    completion = await uploadApi('/api/photo-uploads/complete', completionBody(), 'Xác minh ảnh quá thời gian chờ. Ảnh vẫn được giữ để bạn thử lại.', false)
  }
  await uploadApiResult(completion, 'verification', correlationId, verificationStartedAt)
  const verificationMs = performance.now() - verificationStartedAt
  input.onProgress({ loaded: input.file.size, total: input.file.size })
  const timing: UploadTiming = { finalizationMs: 0, hashMs: Math.round(hashMs), initializationMs: Math.round(initializationMs), totalMs: Math.round(performance.now() - totalStartedAt), transferMs: Math.round(transferMs), transport, tusFallback, transferRetries, verificationMs: Math.round(verificationMs) }
  input.onTiming?.(timing)
  if (!input.onTiming) console.info('[photo-upload:timing]', timing)
}
