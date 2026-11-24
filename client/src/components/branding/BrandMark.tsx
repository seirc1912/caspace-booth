import { useBranding } from '../../contexts/BrandingContext'

interface BrandMarkProps {
  compact?: boolean
}

/** Wordmark with the red LED dot (logo image when the admin configured one). No tagline. */
export function BrandMark({ compact = false }: BrandMarkProps) {
  const branding = useBranding()
  const showLogo = Boolean(branding.logoUrl) && branding.headerDisplayMode !== 'text'
  const showText = branding.headerDisplayMode !== 'logo' || !branding.logoUrl

  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      {showLogo ? <img alt={showText ? '' : branding.brandName} className={compact ? 'size-7 object-contain' : 'h-9 w-auto object-contain'} src={branding.logoUrl!} /> : <span aria-hidden="true" className="cs-led size-[9px] shrink-0 rounded-full" />}
      {showText ? <span className={`truncate font-black tracking-[-0.03em] text-cs-ink ${compact ? 'text-[17px]' : 'text-[19px]'}`}>{branding.brandName}</span> : null}
    </span>
  )
}
