import { AdminShell } from './components/AdminShell'
import { AdminDashboardPage } from './pages/AdminDashboardPage'
import { AdminTemplateEditorPage } from './pages/AdminTemplateEditorPage'
import { AdminTemplatesPage } from './pages/AdminTemplatesPage'
import { AdminRoomsPage } from './pages/AdminRoomsPage'
import { AdminCreateTemplatePage } from './pages/AdminCreateTemplatePage'
import { AdminLoginPage } from './pages/AdminLoginPage'
import { AdminPlaceholderPage } from './pages/AdminPlaceholderPage'
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
  else if (pathname === '/admin/templates/new') page = <AdminCreateTemplatePage />
  else if (pathname === '/admin/sessions') page = <AdminPlaceholderPage title="Sessions" />
  else if (pathname === '/admin/settings') page = <AdminPlaceholderPage title="Settings" />
  else {
    const match = pathname.match(/^\/admin\/templates\/([a-zA-Z0-9_-]+)(?:\/edit)?$/)
    page = match?.[1] ? <AdminTemplateEditorPage templateId={match[1]} /> : <NotFoundPage />
  }
  return <AdminShell>{page}</AdminShell>
}

export default function AdminApp() {
  const { pathname, navigate } = usePathname()
  const isAuthenticated = Boolean(sessionStorage.getItem('selfbooth.admin-session.v1'))
  if (!isAuthenticated || pathname === '/admin/login') return <AdminLoginPage onAuthenticated={() => navigate('/admin/dashboard', true)} />
  return <RoomProvider><AdminTemplateProvider><AssetLibraryProvider><AdminRoutes /></AssetLibraryProvider></AdminTemplateProvider></RoomProvider>
}
