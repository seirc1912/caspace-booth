import type { BrandingConfig } from '../types/branding'

export type BrandStatus = 'active' | 'inactive'

export interface Brand extends BrandingConfig {
  id: string
  status: BrandStatus
}

export interface BrandUpdate extends Partial<BrandingConfig> {
  id: string
}
