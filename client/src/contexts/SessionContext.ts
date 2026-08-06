import { createContext, useContext } from 'react'
import type { CustomerSession } from '../types/session'

export const SessionContext = createContext<CustomerSession | null>(null)

export function useCustomerSession() {
  const session = useContext(SessionContext)
  if (!session) throw new Error('useCustomerSession must be used within SessionProvider')
  return session
}
