import { AdminShell } from './components/AdminShell'
import { AdminDashboardPage } from './pages/AdminDashboardPage'
import { AdminTemplateEditorPage } from './pages/AdminTemplateEditorPage'
import { AdminTemplatesPage } from './pages/AdminTemplatesPage'
import { AdminRoomsPage } from './pages/AdminRoomsPage'
import { AdminTemplateProvider } from './store/AdminTemplateProvider'
import { AssetLibraryProvider } from './store/AssetLibraryProvider'
import { RoomProvider } from './store/RoomProvider'
import { usePathname } from '../../hooks/usePathname'
import { NotFoundPage } from '../../pages/NotFoundPage'

function AdminRoutes() {
  const { pathname } = usePathname()
  let page
  if (pathname === '/admin' || pathname === '/admin/dashboard') page = <AdminDashboardPage />
  else if (pathname === '/admin/rooms') page = <AdminRoomsPage />
  else if (pathname === '/admin/editor') page = <AdminTemplateEditorPage templateId={null} />
  else if (pathname === '/admin/templates') page = <AdminTemplatesPage />
  else if (pathname === '/admin/templates/new') page = <AdminTemplateEditorPage templateId={null} />
  else {
    const match = pathname.match(/^\/admin\/templates\/([a-zA-Z0-9_-]+)(?:\/edit)?$/)
    page = match?.[1] ? <AdminTemplateEditorPage templateId={match[1]} /> : <NotFoundPage />
  }
  return <AdminShell>{page}</AdminShell>
}

export default function AdminApp() {
  return <RoomProvider><AdminTemplateProvider><AssetLibraryProvider><AdminRoutes /></AssetLibraryProvider></AdminTemplateProvider></RoomProvider>
}
