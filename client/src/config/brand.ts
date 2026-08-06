import type { Brand } from '../models/Brand'
import { branding } from './branding'

export const defaultBrand: Readonly<Brand> = Object.freeze({
  id: 'ca-space',
  brandName: branding.brandName,
  websiteLabel: branding.websiteLabel,
  websiteUrl: branding.websiteUrl,
  logoUrl: branding.logoUrl,
  faviconUrl: branding.faviconUrl,
  primaryColor: branding.primaryColor,
  secondaryColor: branding.secondaryColor,
  copyrightYear: branding.copyrightYear,
  status: 'active',
})
