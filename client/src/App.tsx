import { lazy, Suspense } from 'react'
import { CustomerApp } from './CustomerApp'
import { usePathname } from './hooks/usePathname'

const AdminApp = lazy(() => import('./features/admin/AdminApp'))

function App() {
  const { pathname } = usePathname()

  if (pathname.startsWith('/admin')) {
    return <Suspense fallback={<main className="grid min-h-dvh place-items-center">Loading studio…</main>}><AdminApp /></Suspense>
  }

  return <CustomerApp />
}

export default App
