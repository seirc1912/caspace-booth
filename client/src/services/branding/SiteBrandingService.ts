import { branding as defaults } from '../../config/branding'
import { getAdminToken, supabase } from '../catalog/SupabaseCatalogService'
import type { BrandingConfig } from '../../types/branding'

const safeUrl = (value: unknown) => typeof value === 'string' && (/^https:\/\//i.test(value) || value === '') ? value : ''
const merge = (value: unknown): BrandingConfig => {
  const candidate = value && typeof value === 'object' ? value as Partial<BrandingConfig> : {}
  return { ...defaults, ...candidate, logoUrl: safeUrl(candidate.logoUrl) || null, faviconUrl: safeUrl(candidate.faviconUrl) || null, backgroundImageUrl: safeUrl(candidate.backgroundImageUrl) || null, websiteUrl: candidate.websiteUrl === '' ? '' : safeUrl(candidate.websiteUrl) || defaults.websiteUrl,
    facebookUrl: safeUrl(candidate.facebookUrl), instagramUrl: safeUrl(candidate.instagramUrl), tiktokUrl: safeUrl(candidate.tiktokUrl), zaloUrl: safeUrl(candidate.zaloUrl),
    backgroundOverlay: Math.min(0.9, Math.max(0, Number(candidate.backgroundOverlay) || 0)) }
}

export async function loadSiteBranding() {
  const { data, error } = await supabase.rpc('site_branding')
  if (error) throw new Error(error.message)
  return merge(data)
}

export async function saveSiteBranding(value: BrandingConfig) {
  const token = getAdminToken()
  if (!token) throw new Error('Admin session expired. Please sign in again.')
  const { data, error } = await supabase.rpc('admin_save_site_branding', { p_token: token, p_settings: value })
  if (error) throw new Error(error.message)
  return merge(data)
}

export async function uploadBrandingAsset(kind: 'logo' | 'favicon' | 'background', file: File) {
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/x-icon'].includes(file.type) || file.size > 8 * 1024 * 1024) throw new Error('Choose a PNG, JPEG, WebP, GIF, or icon file smaller than 8 MB.')
  const token = getAdminToken()
  if (!token) throw new Error('Admin session expired. Please sign in again.')
  const path = `branding/${kind}-${Date.now()}`
  const result = await supabase.storage.from('site-assets').upload(path, file, { upsert: true, contentType: file.type, cacheControl: '3600', metadata: { adminToken: token } })
  if (result.error) throw new Error(result.error.message)
  return `${supabase.storage.from('site-assets').getPublicUrl(path).data.publicUrl}?v=${Date.now()}`
}

export async function removeBrandingAsset(kind: 'logo' | 'favicon' | 'background') {
  void kind
}
