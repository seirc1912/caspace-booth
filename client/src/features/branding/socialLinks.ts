import type { IconName } from '../../components/ui/Icon'
import type { BrandingConfig } from '../../types/branding'

/** Social links come only from the admin branding settings; a network without a link is omitted. */
export function socialLinks(branding: BrandingConfig) {
  return ([
    branding.facebookUrl && { label: 'Facebook', href: branding.facebookUrl, icon: 'facebook' },
    branding.instagramUrl && { label: 'Instagram', href: branding.instagramUrl, icon: 'instagram' },
    branding.tiktokUrl && { label: 'TikTok', href: branding.tiktokUrl, icon: 'tiktok' },
    branding.zaloUrl && { label: 'Zalo', href: branding.zaloUrl, icon: 'zalo' },
  ].filter(Boolean)) as Array<{ label: string; href: string; icon: IconName }>
}
