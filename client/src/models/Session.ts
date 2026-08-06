import type { CustomerSession } from '../types/session'

export type SessionStatus = 'active' | 'expired' | 'completed' | 'cancelled'

export interface Session extends CustomerSession {
  status: SessionStatus
  brandId: string
  createdAt: string
  completedAt: string | null
}

export interface SessionSummary {
  sessionId: string
  status: SessionStatus
  expiresAt: string
}
