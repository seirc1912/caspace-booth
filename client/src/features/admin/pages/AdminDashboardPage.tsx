import { useAdminTemplates } from '../store/AdminTemplateContext'
import { usePathname } from '../../../hooks/usePathname'

export function AdminDashboardPage() {
  const { templates } = useAdminTemplates(); const { navigate } = usePathname()
  const count = (status: string) => templates.filter((item) => item.status === status).length
  return <div><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-bold text-violet-600">Workspace overview</p><h1 className="mt-1 text-3xl font-bold tracking-tight">Template Studio</h1><p className="mt-2 text-stone-500">Design and manage customer print experiences.</p></div><button className="min-h-12 rounded-xl bg-stone-950 px-5 font-semibold text-white" onClick={() => navigate('/admin/templates/new')} type="button">Create template</button></div><section className="mt-8 grid gap-4 sm:grid-cols-3">{[['Published', count('published')], ['Drafts', count('draft')], ['Archived', count('archived')]].map(([label, value]) => <article className="rounded-2xl bg-white p-5 shadow-sm" key={label}><p className="text-sm font-semibold text-stone-500">{label}</p><p className="mt-2 text-4xl font-bold">{value}</p></article>)}</section><button className="mt-6 min-h-12 rounded-xl border border-stone-200 bg-white px-5 font-semibold" onClick={() => navigate('/admin/templates')} type="button">Manage all templates</button></div>
}
