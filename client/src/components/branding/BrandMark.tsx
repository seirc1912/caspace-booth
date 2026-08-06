import { useBranding } from '../../contexts/BrandingContext'

interface BrandMarkProps {
  compact?: boolean
}

export function BrandMark({ compact = false }: BrandMarkProps) {
  const branding = useBranding()

  return (
    <span className="inline-flex items-center gap-2.5">
      {branding.logoUrl ? <img alt="" className={compact ? 'size-7 object-contain' : 'h-9 w-auto object-contain'} src={branding.logoUrl} /> : null}
      <span className={compact ? 'text-lg font-black tracking-[-0.04em]' : 'text-xl font-black tracking-[-0.04em]'}>{branding.brandName}</span>
    </span>
  )
}
