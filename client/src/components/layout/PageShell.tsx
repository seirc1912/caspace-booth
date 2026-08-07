import type { ReactNode } from 'react'
import { BrandFooter } from './BrandFooter'

interface PageShellProps {
  children: ReactNode
  className?: string
}

export function PageShell({ children, className = '' }: PageShellProps) {
  return (
    <main className={`h-dvh overflow-y-auto overscroll-y-contain bg-[#f7f5f2] text-stone-950 [-webkit-overflow-scrolling:touch] sm:h-auto sm:min-h-dvh sm:overflow-visible ${className}`}>
      <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col px-4 pb-24 pt-5 sm:min-h-dvh sm:px-6 sm:pb-24 sm:pt-8 lg:px-8">
        {children}
        <BrandFooter />
      </div>
    </main>
  )
}
