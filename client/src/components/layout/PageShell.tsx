import type { ReactNode } from 'react'
import { SiteFooter } from '../chrome/SiteFooter'
import { useKeyboardInset } from '../../hooks/useKeyboardInset'

interface PageShellProps {
  children: ReactNode
  /** Sticky action bar, rendered after the content (stays above the keyboard). */
  bottomBar?: ReactNode
  footer?: boolean
  /** Staff pages use a wide column; customer pages are a centred 430 px mobile column. */
  wide?: boolean
  className?: string
}

/** Brushed-metal page; the body scrolls (no fixed-height scroll container). */
export function PageShell({ children, bottomBar, footer = true, wide = false, className = '' }: PageShellProps) {
  useKeyboardInset()
  return <div className="cs-metal min-h-dvh text-cs-ink">
    <div className={`mx-auto flex min-h-dvh w-full flex-col ${wide ? 'max-w-6xl' : 'max-w-[430px]'}`}>
      <main className={`flex flex-1 flex-col px-4 pb-6 pt-[max(16px,env(safe-area-inset-top))] ${className}`}>{children}</main>
      {bottomBar}
      {footer ? <SiteFooter /> : null}
    </div>
  </div>
}
