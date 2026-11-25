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

/**
 * Refreshes every 5 s so the numbers stay live, but never while staff are typing a folder
 * name (a plain <meta refresh> wiped the box after a few digits). Reloads with GET "/" so a
 * resend form is never re-posted.
 */
const autoRefresh = (nonce: string) => `<script nonce="${escape(nonce)}">setInterval(function(){var i=document.querySelector('input[name=folder]');if(i&&(i.value||document.activeElement===i))return;location.replace('/')},5000)</script>`

export function renderStatusPage(status: AgentStatus, message = '', csrfToken = '', nonce = '') {
  const list = (items: string[]) => items.length ? `<ul>${items.map((item) => `<li>${escape(item)}</li>`).join('')}</ul>` : '<p class="muted">Không có</p>'
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Caspace – ${escape(status.boothId)}</title>
<style>body{font:16px system-ui;margin:24px;max-width:760px;color:#1c1917}h1{font-size:22px}.card{border:1px solid #e7e5e4;border-radius:12px;padding:16px;margin:12px 0}.big{font-size:28px;font-weight:700}.muted{color:#78716c}.warn{color:#b91c1c}input{font:inherit;padding:8px;width:60%}button{font:inherit;padding:8px 16px;border-radius:8px;border:0;background:#1c1917;color:#fff}</style></head><body>
<h1>Gửi ảnh phòng chụp · ${escape(status.boothId)}</h1>
${message ? `<p class="card">${escape(message)}</p>` : ''}
<div class="card"><div class="big">${status.pending}</div><div class="muted">ảnh đang chờ gửi</div></div>
<div class="card"><div class="big">${status.uploaded}</div><div class="muted">ảnh đã gửi từ khi bật máy</div></div>
<div class="card ${status.lastError ? 'warn' : ''}">Mạng / máy chủ: ${status.lastError ? `lỗi gần nhất — ${escape(status.lastError)} (đang tự thử lại)` : 'bình thường'}</div>
<div class="card"><b>Thư mục sai tên (không gửi)</b> — đổi tên để bắt đầu bằng số điện thoại 10 số, app tự gửi lại:${list(status.unrecognized)}</div>
<div class="card"><b>Ảnh gửi thất bại</b>${list(status.failures.map((item) => `${item.file}: ${item.reason}`))}</div>
<form class="card" method="post" action="/resend"><b>Gửi lại thư mục</b> (dùng khi khách cần ảnh cũ hơn 6 giờ hoặc ảnh đã bị xoá trên hệ thống; chỉ gửi ảnh từ 25/11/2026 trở đi)<br><br>
<input type="hidden" name="token" value="${escape(csrfToken)}"><input name="folder" placeholder="Số điện thoại hoặc tên thư mục, ví dụ 0947860616" autocomplete="off" required> <button>Gửi lại</button></form>
<p class="muted">Thư mục theo dõi: ${escape(status.watchRoot)} · Máy chủ: ${escape(status.apiBaseUrl)}</p>${nonce ? autoRefresh(nonce) : ''}</body></html>`
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
  // The last resend result stays on the page across refreshes for 10 minutes.
  let lastResend: { message: string; at: number } | null = null
  const lastMessage = () => lastResend && Date.now() - lastResend.at < 10 * 60_000 ? lastResend.message : ''
  const send = (response: import('node:http').ServerResponse, status: number, html: string, nonce = '') => {
    const script = nonce ? `script-src 'nonce-${nonce}'; ` : ''
    response.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY', 'Content-Security-Policy': `default-src 'none'; ${script}style-src 'unsafe-inline'; form-action 'self'` })
    response.end(html)
  }
  const page = (response: import('node:http').ServerResponse) => {
    const nonce = randomBytes(16).toString('base64url')
    send(response, 200, renderStatusPage(getStatus(), lastMessage(), csrfToken, nonce), nonce)
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
        void resend(folder)
          .catch((error: unknown) => `Không đọc được thư mục: ${error instanceof Error ? error.message : String(error)}`)
          .then((message) => { lastResend = { message, at: Date.now() }; page(response) })
      })
      return
    }
    page(response)
  })
  server.listen(port, '127.0.0.1')
  return server
}
