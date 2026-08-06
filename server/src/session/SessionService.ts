import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'

export interface CustomerSession {
  sessionId: string
  token: string
  expiresAt: string
}

const sessionLifetimeMs = 12 * 60 * 60 * 1000

export class SessionService {
  constructor(private readonly secret: string) {
    if (secret.length < 32) throw new Error('SESSION_SECRET must contain at least 32 characters')
  }

  create(): CustomerSession {
    const sessionId = randomUUID()
    const expiresAt = Date.now() + sessionLifetimeMs
    return { sessionId, token: this.sign(sessionId, expiresAt), expiresAt: new Date(expiresAt).toISOString() }
  }

  verify(sessionId: string, token: string) {
    const [tokenSessionId, expiresAtValue, signature] = token.split('.')
    const expiresAt = Number(expiresAtValue)
    if (tokenSessionId !== sessionId || !signature || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) return false
    const expected = this.signature(sessionId, expiresAt)
    const actualBuffer = Buffer.from(signature)
    const expectedBuffer = Buffer.from(expected)
    return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer)
  }

  private sign(sessionId: string, expiresAt: number) {
    return `${sessionId}.${expiresAt}.${this.signature(sessionId, expiresAt)}`
  }

  private signature(sessionId: string, expiresAt: number) {
    return createHmac('sha256', this.secret).update(`${sessionId}.${expiresAt}`).digest('base64url')
  }
}
