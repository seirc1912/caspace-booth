export interface CustomerSession {
  sessionId: string
  token: string
  expiresAt: string
  boothId?: string
  phoneNumber?: string
}
