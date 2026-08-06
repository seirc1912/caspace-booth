import type { ReactNode } from 'react'
import { BrandMark } from '../../../components/branding/BrandMark'
import { usePathname } from '../../../hooks/usePathname'

export function AdminShell({ children }: { children: ReactNode }) {
  const { pathname, navigate } = usePathname()
  const link = (path: string, label: string) => <button className={`min-h-11 rounded-xl px-4 text-left text-sm font-semibold ${pathname === path ? 'bg-stone-950 text-white' : 'text-stone-600 hover:bg-stone-100'}`} onClick={() => navigate(path)} type="button">{label}</button>
  const placeholder = (label: string) => <button aria-disabled="true" className="min-h-11 cursor-not-allowed rounded-xl px-4 text-left text-sm font-semibold text-stone-300" type="button">{label}</button>
  return <div className="min-h-dvh bg-[#f4f3f1] text-stone-950"><header className="flex h-16 items-center justify-between border-b border-stone-200 bg-white px-4 lg:px-6"><BrandMark compact /><span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-bold text-violet-700">Admin Template Studio</span></header><div className="mx-auto grid max-w-[1600px] lg:grid-cols-[14rem_1fr]"><aside className="hidden min-h-[calc(100dvh-4rem)] border-r border-stone-200 bg-white p-3 lg:grid lg:content-start lg:gap-1">{link('/admin/dashboard', 'Dashboard')}{link('/admin/rooms', 'Rooms')}{link('/admin/templates', 'Templates')}{placeholder('Assets')}{placeholder('Branding')}{placeholder('Print Queue')}{placeholder('Settings')}<div className="mt-5 border-t border-stone-100 pt-4 text-xs leading-5 text-stone-400">Admin-only frontend workspace<br />Local draft persistence</div></aside><main className="min-w-0 p-4 sm:p-6 lg:p-8">{children}</main></div></div>
}
