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

  const links = [
    branding.address && { label: branding.address, href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(branding.address)}`, icon: '⌖' },
    branding.phone && { label: branding.phone, href: `tel:${branding.phone}`, icon: '☎' }, branding.email && { label: branding.email, href: `mailto:${branding.email}`, icon: '✉' },
    branding.websiteUrl && { label: branding.websiteLabel, href: branding.websiteUrl, icon: '↗' }, branding.facebookUrl && { label: 'Facebook', href: branding.facebookUrl, icon: 'f' },
    branding.instagramUrl && { label: 'Instagram', href: branding.instagramUrl, icon: '◎' }, branding.tiktokUrl && { label: 'TikTok', href: branding.tiktokUrl, icon: '♪' }, branding.zaloUrl && { label: 'Zalo', href: branding.zaloUrl, icon: 'Z' },
  ].filter(Boolean) as Array<{ label: string; href: string; icon: string }>

  return (
    <footer className="mt-auto border-t border-stone-200 pt-6 text-center text-sm text-stone-500">
      <p className="font-bold text-stone-700">{branding.footerBrandText || branding.brandName}</p>
      {links.length ? <div className="mx-auto mt-3 flex max-w-3xl flex-wrap justify-center gap-x-5 gap-y-2">{links.map((item) => <a className="inline-flex items-center gap-1.5 hover:text-[var(--brand-primary)]" href={item.href} key={`${item.label}-${item.href}`} rel={item.href.startsWith('http') ? 'noopener noreferrer' : undefined} target={item.href.startsWith('http') ? '_blank' : undefined}><span aria-hidden>{item.icon}</span>{item.label}</a>)}</div> : null}
      <p className="mt-4">&copy; {branding.copyrightYear} {branding.brandName}</p>
    </footer>
  )
}
