import { createContext, useContext } from 'react'
import type { BrandingConfig } from '../types/branding'

export const BrandingContext = createContext<BrandingConfig | null>(null)

export function useBranding() {
  const value = useContext(BrandingContext)

  if (!value) {
    throw new Error('useBranding must be used within BrandingProvider')
  }

  return value
}
