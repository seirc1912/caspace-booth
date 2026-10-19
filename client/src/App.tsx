import { lazy, Suspense } from 'react'
import { CustomerApp } from './CustomerApp'
import { customerRoutes, staffRoutes } from './config/routes'
import { usePathname } from './hooks/usePathname'

const AdminApp = lazy(() => import('./features/admin/AdminApp'))
const ColorLabPage = lazy(() => import('./pages/ColorLabPage').then((module) => ({ default: module.ColorLabPage })))
const PhotoUploadPage = lazy(() => import('./pages/PhotoUploadPage').then((module) => ({ default: module.PhotoUploadPage })))
const StaffPhotosPage = lazy(() => import('./pages/StaffPhotosPage').then((module) => ({ default: module.StaffPhotosPage })))

function App() {
  const { pathname } = usePathname()

  if (pathname === staffRoutes.photos) {
    return <Suspense fallback={<main className="grid min-h-dvh place-items-center">Đang mở kho ảnh…</main>}><StaffPhotosPage /></Suspense>
  }

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
