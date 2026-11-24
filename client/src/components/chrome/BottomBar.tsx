import type { ReactNode } from 'react'

/** Sticky bottom action bar (iPhone safe-area; lifted above the on-screen keyboard). */
export function BottomBar({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`cs-bottom-bar mt-auto ${className}`}>{children}</div>
}

export function BarHint({ children, id }: { children: ReactNode; id?: string }) {
  return <p className="mt-2 text-center text-[13px] leading-snug text-cs-ink-2" id={id}>{children}</p>
}
