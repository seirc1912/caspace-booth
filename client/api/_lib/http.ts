export interface ApiRequest {
  method?: string
  headers: Record<string, string | string[] | undefined>
  body?: unknown
}

export interface ApiResponse {
  status(code: number): ApiResponse
  setHeader(name: string, value: string): void
  json(value: unknown): void
  end(): void
}

export function readJsonBody(request: ApiRequest) {
  if (typeof request.body === 'string') return JSON.parse(request.body) as unknown
  return request.body
}

export function setPrivateResponse(response: ApiResponse) {
  response.setHeader('Cache-Control', 'no-store, max-age=0')
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
}

export function enforceSameOrigin(request: ApiRequest) {
  const origin = header(request, 'origin')
  const host = header(request, 'host')
  if (!origin || !host) return
  const originHost = (() => {
    try { return new URL(origin).host } catch { throw new UploadApiError(403, 'Yêu cầu tải ảnh không hợp lệ.') }
  })()
  if (originHost !== host) throw new UploadApiError(403, 'Yêu cầu tải ảnh không hợp lệ.')
}

export function header(request: ApiRequest, name: string) {
  const value = request.headers[name] ?? request.headers[name.toLowerCase()]
  return Array.isArray(value) ? value[0] : value
}

export class UploadApiError extends Error {
  constructor(readonly status: number, message: string, readonly retryAfterSeconds?: number) { super(message) }
}

export function sendApiError(response: ApiResponse, reason: unknown) {
  const status = reason instanceof UploadApiError ? reason.status : 500
  const message = reason instanceof UploadApiError ? reason.message : 'Không thể xử lý ảnh lúc này. Vui lòng thử lại.'
  if (reason instanceof UploadApiError && reason.retryAfterSeconds) response.setHeader('Retry-After', String(reason.retryAfterSeconds))
  response.status(status).json({ error: message })
}
