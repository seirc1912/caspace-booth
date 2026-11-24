import type { ReactNode } from 'react'
import { Icon, type IconName } from '../ui/Icon'

interface AlertProps {
  kind: 'error' | 'success'
  title?: string
  children: ReactNode
  icon?: IconName
  className?: string
}

export function Alert({ kind, title, children, icon, className = '' }: AlertProps) {
  const tone = kind === 'error' ? 'border-cs-alert-error-border bg-cs-alert-error-bg text-cs-alert-error-fg' : 'border-cs-alert-success-border bg-cs-alert-success-bg text-cs-alert-success-fg'
  return <div className={`flex gap-3 rounded-[20px] border px-4 py-3 text-sm leading-relaxed ${tone} ${className}`} role={kind === 'error' ? 'alert' : 'status'}>
    <Icon className="mt-0.5 size-5 shrink-0" name={icon ?? (kind === 'error' ? 'alert' : 'check')} />
    <div className="min-w-0">{title ? <p className="font-extrabold">{title}</p> : null}<div>{children}</div></div>
  </div>
}
