export type ButtonVariant = 'primary' | 'chrome' | 'send'

const variantClass: Record<ButtonVariant, string> = {
  primary: 'cs-btn-primary min-h-14 rounded-[16px] px-5 text-base font-extrabold',
  send: 'cs-btn-send min-h-14 rounded-[16px] px-5 text-base font-extrabold',
  chrome: 'cs-btn-chrome min-h-14 rounded-[16px] px-4 text-sm font-bold',
}

/** Classes for a chrome button; links ("Về trang chủ") reuse them. Disabled = grey with dashed border. */
export function buttonClass(variant: ButtonVariant, { disabled = false, className = '' }: { disabled?: boolean; className?: string } = {}) {
  const base = 'cs-press inline-flex items-center justify-center gap-2 text-center leading-tight focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-cs-ink'
  const look = disabled ? variantClass[variant].replace(/^cs-btn-\w+/, 'cs-btn-disabled') + ' cursor-not-allowed' : variantClass[variant]
  return `${base} ${look} ${className}`
}
