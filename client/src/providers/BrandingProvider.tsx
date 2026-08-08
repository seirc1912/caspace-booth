import { useEffect, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { BrandingContext } from '../contexts/BrandingContext'
import type { BrandingConfig } from '../types/branding'
import { loadSiteBranding } from '../services/branding/SiteBrandingService'

interface BrandingProviderProps {
  branding: BrandingConfig
  children: ReactNode
}

type BrandStyles = CSSProperties & {
  '--brand-primary': string
  '--brand-secondary': string
}

export function BrandingProvider({ branding, children }: BrandingProviderProps) {
  const [current, setCurrent] = useState(branding)
  useEffect(() => { void loadSiteBranding().then(setCurrent).catch(() => undefined) }, [])
  useEffect(() => { const update = (event: Event) => setCurrent((event as CustomEvent<BrandingConfig>).detail); window.addEventListener('site-branding-updated', update); return () => window.removeEventListener('site-branding-updated', update) }, [])
  useEffect(() => {
    document.title = current.brandName

    const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    themeColor?.setAttribute('content', current.secondaryColor)

    const existingFavicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
    if (current.faviconUrl) {
      const favicon = existingFavicon ?? document.head.appendChild(document.createElement('link'))
      favicon.rel = 'icon'
      favicon.href = current.faviconUrl
    } else {
      existingFavicon?.remove()
    }
  }, [current])

  const style: BrandStyles = {
    '--brand-primary': current.primaryColor,
    '--brand-secondary': current.secondaryColor,
  }

  return (
    <BrandingContext.Provider value={current}>
      <div style={style}>{children}</div>
    </BrandingContext.Provider>
  )
}
