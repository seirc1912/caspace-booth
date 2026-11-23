import { useBranding } from '../../contexts/BrandingContext'
import { Icon, type IconName } from '../ui/Icon'
import { socialLinks } from '../../features/branding/socialLinks'
import { formatPhoneNumberForDisplay } from '../../features/orders/phoneDisplay'

export function SiteFooter() {
  const branding = useBranding()
  const links = ([
    branding.address && { label: branding.address, href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(branding.address)}`, icon: 'pin' },
    branding.phone && { label: formatPhoneNumberForDisplay(branding.phone), href: `tel:${branding.phone.replace(/\s/g, '')}`, icon: 'phone' },
    branding.email && { label: branding.email, href: `mailto:${branding.email}`, icon: 'mail' },
    branding.websiteUrl && { label: branding.websiteLabel || branding.websiteUrl, href: branding.websiteUrl, icon: 'globe' },
    ...socialLinks(branding),
  ].filter(Boolean)) as Array<{ label: string; href: string; icon: IconName }>

  return <footer className="cs-lcd px-4 pb-[max(24px,env(safe-area-inset-bottom))] pt-5 text-sm">
    <p className="font-black">{branding.footerBrandText || branding.brandName}</p>
    {links.length ? <ul className="mt-2 grid">{links.map((item) => <li key={`${item.icon}-${item.href}`}><a className="flex min-h-11 items-center gap-3 text-[#D3D5D8] hover:text-white" href={item.href} rel={item.href.startsWith('http') ? 'noopener noreferrer' : undefined} target={item.href.startsWith('http') ? '_blank' : undefined}><Icon className="size-[18px] shrink-0 text-[#9EA2A8]" name={item.icon} /><span className="min-w-0 break-words">{item.label}</span></a></li>)}</ul> : null}
    <p className="cs-mono mt-3 text-[11px] text-[#9EA2A8]">© {branding.copyrightYear} {branding.brandName}</p>
  </footer>
}
