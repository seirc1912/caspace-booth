import { lazy, Suspense } from 'react'
import { CustomerApp } from './CustomerApp'
import { customerRoutes } from './config/routes'
import { usePathname } from './hooks/usePathname'

const AdminApp = lazy(() => import('./features/admin/AdminApp'))
const ColorLabPage = lazy(() => import('./pages/ColorLabPage').then((module) => ({ default: module.ColorLabPage })))
const PhotoUploadPage = lazy(() => import('./pages/PhotoUploadPage').then((module) => ({ default: module.PhotoUploadPage })))

function App() {
  const { pathname } = usePathname()

  if (pathname.startsWith('/admin')) {
    return <Suspense fallback={<main className="grid min-h-dvh place-items-center">Loading studio…</main>}><AdminApp /></Suspense>
  }

  if (pathname === customerRoutes.colorLab) {
    return <Suspense fallback={<main className="grid min-h-dvh place-items-center">Opening Color Lab…</main>}><ColorLabPage /></Suspense>
  }

  if (pathname === customerRoutes.photoUpload) {
    return <Suspense fallback={<main className="grid min-h-dvh place-items-center">Đang mở trang tải ảnh…</main>}><PhotoUploadPage /></Suspense>
  }

  return <CustomerApp />
}

export default App
