import type { Session, SessionSummary } from '../../models/Session'

export interface CreateSessionInput {
  brandId?: string
}

export interface SessionService {
  create(input?: CreateSessionInput): Promise<Session>
  getById(sessionId: string): Promise<SessionSummary>
  complete(sessionId: string): Promise<SessionSummary>
}
