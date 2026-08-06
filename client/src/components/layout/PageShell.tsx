import type { ReactNode } from 'react'
import { BrandFooter } from './BrandFooter'

interface PageShellProps {
  children: ReactNode
  className?: string
}

export function PageShell({ children, className = '' }: PageShellProps) {
  return (
    <main className={`min-h-dvh bg-[#f7f5f2] text-stone-950 ${className}`}>
      <div className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-4 pb-24 pt-5 sm:px-6 sm:pb-24 sm:pt-8 lg:px-8">
        {children}
        <BrandFooter />
      </div>
    </main>
  )
}
