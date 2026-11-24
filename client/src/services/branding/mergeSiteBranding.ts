import { branding as defaults } from '../../config/branding'
import type { BrandingConfig } from '../../types/branding'

const safeUrl = (value: unknown) => typeof value === 'string' && (/^https:\/\//i.test(value) || value === '') ? value : ''
/** Settings the customer site no longer uses; dropped on read so the next admin save removes them from the database. */
const retiredKeys = ['badgeText', 'homeStepLabel', 'phoneHelper', 'secondaryColor', 'backgroundColor', 'backgroundImageUrl', 'backgroundSize', 'backgroundPosition', 'backgroundOverlay']
export const mergeSiteBranding = (value: unknown): BrandingConfig => {
  const candidate = value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).filter(([key]) => !retiredKeys.includes(key))) as Partial<BrandingConfig> : {}
  return { ...defaults, ...candidate, logoUrl: safeUrl(candidate.logoUrl) || null, faviconUrl: safeUrl(candidate.faviconUrl) || null, websiteUrl: candidate.websiteUrl === '' ? '' : safeUrl(candidate.websiteUrl) || defaults.websiteUrl,
    facebookUrl: safeUrl(candidate.facebookUrl), instagramUrl: safeUrl(candidate.instagramUrl), tiktokUrl: safeUrl(candidate.tiktokUrl), zaloUrl: safeUrl(candidate.zaloUrl) }
}
