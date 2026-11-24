import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { buttonClass, type ButtonVariant } from './buttonClass'

export function Spinner({ className = 'size-[18px]' }: { className?: string }) {
  return <span aria-hidden="true" className={`${className} inline-block shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent`} />
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  loading?: boolean
  icon?: ReactNode
  trailingIcon?: ReactNode
}

export function Button({ variant = 'primary', loading = false, icon, trailingIcon, disabled, className = '', children, type = 'button', ...props }: ButtonProps) {
  const inactive = Boolean(disabled) && !loading
  return <button aria-busy={loading || undefined} className={buttonClass(variant, { disabled: inactive, className: `${loading ? 'cursor-progress' : ''} ${className}` })} disabled={disabled || loading} type={type} {...props}>
    {loading ? <Spinner /> : icon}
    <span className="min-w-0">{children}</span>
    {loading ? null : trailingIcon}
  </button>
}
