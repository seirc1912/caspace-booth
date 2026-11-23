/**
 * Identity of one customer visit to a room, used to scope the editor draft
 * (IndexedDB). Created on the device; replaces the old Supabase RPC session.
 */
export interface CustomerSession {
  sessionId: string
  boothId: string
  phoneNumber: string
  createdAt: string
}

export function createCustomerSession(boothId: string, phoneNumber: string): CustomerSession {
  const sessionId = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, '0')).join('')
  return { sessionId, boothId, phoneNumber, createdAt: new Date().toISOString() }
}
