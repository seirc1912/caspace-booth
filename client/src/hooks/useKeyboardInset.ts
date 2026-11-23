import { useEffect } from 'react'

/**
 * iOS Safari keeps the layout viewport when the keyboard opens, so a sticky bottom bar
 * would sit behind it. Publishes the covered height as --cs-keyboard-inset.
 */
export function useKeyboardInset() {
  useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) return
    const root = document.documentElement
    const update = () => {
      const inset = Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop))
      root.style.setProperty('--cs-keyboard-inset', `${inset}px`)
    }
    update()
    viewport.addEventListener('resize', update)
    viewport.addEventListener('scroll', update)
    return () => { viewport.removeEventListener('resize', update); viewport.removeEventListener('scroll', update); root.style.removeProperty('--cs-keyboard-inset') }
  }, [])
}
