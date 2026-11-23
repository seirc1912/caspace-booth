import { createHash } from 'node:crypto'
import { basename, extname } from 'node:path'

export interface BoothApi { baseUrl: string; key: string; fetchImpl?: typeof fetch }

export class AgentUploadError extends Error {
  constructor(message: string, readonly status: number, readonly retryable: boolean) { super(message) }
}

interface InitResult { alreadyUploaded: boolean; objectPath: string; uploadUrl?: string; completionToken: string }

async function call<T>(api: BoothApi, route: string, body: unknown): Promise<T> {
  let response: Response
  try {
    response = await (api.fetchImpl ?? fetch)(`${api.baseUrl.replace(/\/$/, '')}${route}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${api.key}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    })
  } catch { throw new AgentUploadError('NETWORK', 0, true) }
  const payload = await response.json().catch(() => ({})) as T & { error?: string }
  if (!response.ok) {
    // 404/405 = the address is not a caspace server with the booth API (wrong "Máy chủ",
    // or the site is not updated yet). Retried slowly: fixing the server makes it work.
    if (response.status === 404 || response.status === 405) throw new AgentUploadError(`Sai địa chỉ máy chủ hoặc máy chủ chưa có tính năng gửi ảnh phòng chụp (${api.baseUrl}, HTTP ${response.status})`, response.status, true)
    if (response.status === 401) throw new AgentUploadError(payload.error ?? 'Mã bí mật không đúng', 401, false)
    throw new AgentUploadError(payload.error ?? `HTTP_${response.status}`, response.status, response.status >= 500 || response.status === 408 || response.status === 429)
  }
  return payload
}

async function put(api: BoothApi, uploadUrl: string, bytes: Buffer, filename: string) {
  const form = new FormData()
  form.append('cacheControl', '3600')
  form.append('', new Blob([new Uint8Array(bytes)], { type: 'image/jpeg' }), filename)
  let response: Response
  try {
    response = await (api.fetchImpl ?? fetch)(uploadUrl, { method: 'PUT', headers: { 'x-upsert': 'false' }, body: form, signal: AbortSignal.timeout(120_000) })
  } catch { throw new AgentUploadError('NETWORK', 0, true) }
  if (response.ok) return
  const text = await response.text().catch(() => '')
  // A previous attempt may already have stored it; /complete verifies the bytes.
  if (response.status === 409 || (response.status === 400 && /duplicate|already exists/i.test(text))) return
  throw new AgentUploadError(`STORAGE_${response.status}`, response.status, response.status >= 500 || response.status === 408 || response.status === 429)
}

async function send(api: BoothApi, bytes: Buffer, fields: Record<string, unknown>, filename: string) {
  const metadata = { ...fields, filename, mimeType: 'image/jpeg', size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), prefix: bytes.subarray(0, 16).toString('base64') }
  const init = await call<InitResult>(api, '/api/booth/init', metadata)
  if (!init.alreadyUploaded) {
    if (!init.uploadUrl) throw new AgentUploadError('NO_UPLOAD_URL', 502, true)
    await put(api, init.uploadUrl, bytes, filename)
  }
  await call(api, '/api/booth/complete', { ...metadata, objectPath: init.objectPath, completionToken: init.completionToken })
  return init
}

/** Original first, then its 400px thumbnail. Idempotent: re-sending the same file is cheap. */
export async function uploadExport(input: { api: BoothApi; phone: string; filePath: string; bytes: Buffer; makeThumbnail: (bytes: Buffer) => Promise<Buffer> }) {
  const filename = basename(input.filePath)
  const original = await send(input.api, input.bytes, { phone: input.phone, variant: 'original' }, filename)
  const thumbnail = await input.makeThumbnail(input.bytes)
  await send(input.api, thumbnail, { phone: input.phone, variant: 'thumbnail', originalPath: original.objectPath }, `${basename(filename, extname(filename))}-thumb.jpg`)
  return { objectPath: original.objectPath, alreadyUploaded: original.alreadyUploaded }
}
