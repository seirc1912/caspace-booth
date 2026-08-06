import { useEffect } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { BrandingContext } from '../contexts/BrandingContext'
import type { BrandingConfig } from '../types/branding'

interface BrandingProviderProps {
  branding: BrandingConfig
  children: ReactNode
}

type BrandStyles = CSSProperties & {
  '--brand-primary': string
  '--brand-secondary': string
}

export function BrandingProvider({ branding, children }: BrandingProviderProps) {
  useEffect(() => {
    document.title = branding.brandName

    const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    themeColor?.setAttribute('content', branding.secondaryColor)

    const existingFavicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
    if (branding.faviconUrl) {
      const favicon = existingFavicon ?? document.head.appendChild(document.createElement('link'))
      favicon.rel = 'icon'
      favicon.href = branding.faviconUrl
    } else {
      existingFavicon?.remove()
    }
  }, [branding])

  const style: BrandStyles = {
    '--brand-primary': branding.primaryColor,
    '--brand-secondary': branding.secondaryColor,
  }

  return (
    <BrandingContext.Provider value={branding}>
      <div style={style}>{children}</div>
    </BrandingContext.Provider>
  )
}
