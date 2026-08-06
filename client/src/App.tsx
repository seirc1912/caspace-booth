import { lazy, Suspense } from 'react'
import { CustomerApp } from './CustomerApp'
import { usePathname } from './hooks/usePathname'
import { NotFoundPage } from './pages/NotFoundPage'

const AdminApp = lazy(() => import('./features/admin/AdminApp'))

function App() {
  const { pathname } = usePathname()

  if (pathname.startsWith('/admin')) {
    if (import.meta.env.VITE_APP_ROLE !== 'admin') return <NotFoundPage />
    return <Suspense fallback={<main className="grid min-h-dvh place-items-center">Loading studio…</main>}><AdminApp /></Suspense>
  }

  return <CustomerApp />
}

export default App
