import type { ButtonHTMLAttributes } from 'react'

type PrimaryButtonProps = ButtonHTMLAttributes<HTMLButtonElement>

export function PrimaryButton({ className = '', ...props }: PrimaryButtonProps) {
  return (
    <button
      className={`min-h-12 rounded-xl bg-[var(--brand-secondary)] px-5 py-3 text-base font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-secondary)] disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      type="button"
      {...props}
    />
  )
}
