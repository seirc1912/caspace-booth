import type { ReactNode } from 'react'
import { BrandFooter } from './BrandFooter'
import { useBranding } from '../../contexts/BrandingContext'

interface PageShellProps {
  children: ReactNode
  className?: string
}

export function PageShell({ children, className = '' }: PageShellProps) {
  const branding = useBranding()
  const background = branding.backgroundImageUrl ? `linear-gradient(rgba(0,0,0,${branding.backgroundOverlay}),rgba(0,0,0,${branding.backgroundOverlay})),url("${branding.backgroundImageUrl.replace(/"/g, '%22')}")` : undefined
  return (
    <main className={`h-dvh overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch] sm:h-auto sm:min-h-dvh sm:overflow-visible ${className}`} style={{ backgroundColor: branding.backgroundColor, backgroundImage: background, backgroundPosition: branding.backgroundPosition, backgroundSize: branding.backgroundSize, color: branding.textColor }}>
      <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col px-4 pb-24 pt-5 sm:min-h-dvh sm:px-6 sm:pb-24 sm:pt-8 lg:px-8">
        {children}
        <BrandFooter />
      </div>
    </main>
  )
}
