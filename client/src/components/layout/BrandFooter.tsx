import { useBranding } from '../../contexts/BrandingContext'

interface BrandFooterProps {
  compact?: boolean
}

export function BrandFooter({ compact = false }: BrandFooterProps) {
  const branding = useBranding()

  if (compact) {
    return (
      <div className="pt-2 text-center text-[0.68rem] text-stone-400">
        &copy; {branding.copyrightYear} {branding.brandName} &middot; <a className="hover:text-stone-600" href={branding.websiteUrl} rel="noreferrer" target="_blank">{branding.websiteLabel}</a>
      </div>
    )
  }

  return (
    <footer className="mt-auto border-t border-stone-200 pt-6 text-center text-sm text-stone-500">
      <p>&copy; {branding.copyrightYear} {branding.brandName}</p>
      <a className="mt-1 inline-block font-medium text-[var(--brand-secondary)] underline-offset-4 hover:underline" href={branding.websiteUrl} rel="noreferrer" target="_blank">
        {branding.websiteLabel}
      </a>
    </footer>
  )
}
