import { randomBytes } from 'node:crypto'
import { createServer } from 'node:http'

export interface AgentStatus {
  boothId: string
  watchRoot: string
  apiBaseUrl: string
  pending: number
  uploaded: number
  lastError: string | null
  unrecognized: string[]
  failures: Array<{ file: string; reason: string }>
}

const escape = (value: string) => value.replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`)

export function renderStatusPage(status: AgentStatus, message = '', csrfToken = '') {
  const list = (items: string[]) => items.length ? `<ul>${items.map((item) => `<li>${escape(item)}</li>`).join('')}</ul>` : '<p class="muted">Không có</p>'
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta http-equiv="refresh" content="5"><title>Caspace – ${escape(status.boothId)}</title>
<style>body{font:16px system-ui;margin:24px;max-width:760px;color:#1c1917}h1{font-size:22px}.card{border:1px solid #e7e5e4;border-radius:12px;padding:16px;margin:12px 0}.big{font-size:28px;font-weight:700}.muted{color:#78716c}.warn{color:#b91c1c}input{font:inherit;padding:8px;width:60%}button{font:inherit;padding:8px 16px;border-radius:8px;border:0;background:#1c1917;color:#fff}</style></head><body>
<h1>Gửi ảnh phòng chụp · ${escape(status.boothId)}</h1>
${message ? `<p class="card">${escape(message)}</p>` : ''}
<div class="card"><div class="big">${status.pending}</div><div class="muted">ảnh đang chờ gửi</div></div>
<div class="card"><div class="big">${status.uploaded}</div><div class="muted">ảnh đã gửi từ khi bật máy</div></div>
<div class="card ${status.lastError ? 'warn' : ''}">Mạng / máy chủ: ${status.lastError ? `lỗi gần nhất — ${escape(status.lastError)} (đang tự thử lại)` : 'bình thường'}</div>
<div class="card"><b>Thư mục sai tên (không gửi)</b> — đổi tên để bắt đầu bằng số điện thoại 10 số, app tự gửi lại:${list(status.unrecognized)}</div>
<div class="card"><b>Ảnh gửi thất bại</b>${list(status.failures.map((item) => `${item.file}: ${item.reason}`))}</div>
<form class="card" method="post" action="/resend"><b>Gửi lại thư mục</b> (dùng khi khách cần ảnh cũ hơn 6 giờ hoặc ảnh đã bị xoá trên hệ thống)<br><br>
<input type="hidden" name="token" value="${escape(csrfToken)}"><input name="folder" placeholder="Tên thư mục, ví dụ 0947860616" required> <button>Gửi lại</button></form>
<p class="muted">Thư mục theo dõi: ${escape(status.watchRoot)} · Máy chủ: ${escape(status.apiBaseUrl)}</p></body></html>`
}

/** Only the browser on this PC may use the page: Host must be loopback (blocks DNS rebinding). */
export function isLocalHost(hostHeader: string | undefined, port: number) {
  return hostHeader === `127.0.0.1:${port}` || hostHeader === `localhost:${port}`
}

/**
 * Local-only status page (127.0.0.1). "Gửi lại thư mục" needs a per-process token
 * embedded in the form, so a website open in the browser cannot trigger it (CSRF).
 */
export function startStatusServer(port: number, getStatus: () => AgentStatus, resend: (folder: string) => Promise<string>) {
  const csrfToken = randomBytes(24).toString('base64url')
  const send = (response: import('node:http').ServerResponse, status: number, html: string) => {
    response.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'" })
    response.end(html)
  }
  const server = createServer((request, response) => {
    if (!isLocalHost(request.headers.host, port)) { send(response, 403, 'Forbidden'); return }
    if (request.method === 'POST' && request.url === '/resend') {
      let body = ''
      request.on('data', (chunk: Buffer) => { body += chunk.toString('utf8'); if (body.length > 2_000) request.destroy() })
      request.on('end', () => {
        const form = new URLSearchParams(body)
        if (form.get('token') !== csrfToken) { send(response, 403, 'Forbidden'); return }
        const folder = form.get('folder')?.trim() ?? ''
        void resend(folder).then((message) => send(response, 200, renderStatusPage(getStatus(), message, csrfToken)))
      })
      return
    }
    send(response, 200, renderStatusPage(getStatus(), '', csrfToken))
  })
  server.listen(port, '127.0.0.1')
  return server
}
