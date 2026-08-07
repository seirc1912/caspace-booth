import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { SessionContext } from '../contexts/SessionContext'
import type { CustomerSession } from '../types/session'
import { env } from '../config/env'

interface SessionProviderProps {
  children: ReactNode
}

const storageKey = 'selfbooth.customer-session'
let pendingSession: Promise<CustomerSession> | null = null

function storedSession() {
  try {
    const value = sessionStorage.getItem(storageKey)
    if (!value) return null
    const session = JSON.parse(value) as CustomerSession
    return Date.parse(session.expiresAt) > Date.now() ? session : null
  } catch {
    return null
  }
}

async function createSession() {
  const current = storedSession()
  if (current) return current
  pendingSession ??= fetch(`${env.apiUrl}/api/sessions`, { method: 'POST' }).then(async (response) => {
    if (!response.ok) throw new Error('Unable to start a secure booth session')
    const session = await response.json() as CustomerSession
    sessionStorage.setItem(storageKey, JSON.stringify(session))
    return session
  }).finally(() => { pendingSession = null })
  return pendingSession
}

export function SessionProvider({ children }: SessionProviderProps) {
  const [session, setSession] = useState<CustomerSession | null>(() => storedSession())
  const [error, setError] = useState(false)

  useEffect(() => {
    if (session) return
    let active = true
    createSession().then((value) => { if (active) setSession(value) }).catch(() => { if (active) setError(true) })
    return () => { active = false }
  }, [session])

  if (error) {
    return <main className="grid min-h-dvh place-items-center bg-[#f7f5f2] p-6 text-center"><div><h1 className="text-2xl font-bold">Session unavailable</h1><p className="mt-2 text-stone-500">Please refresh to start a new booth session.</p></div></main>
  }
  if (!session) return <main className="grid min-h-dvh place-items-center bg-[#f7f5f2]"><p className="animate-pulse text-sm font-semibold text-stone-500">Starting your secure session…</p></main>

  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>
}
