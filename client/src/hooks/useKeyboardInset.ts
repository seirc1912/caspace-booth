import { useEffect } from 'react'

/** Space kept between the focused field and the action bar above the keyboard. */
const FIELD_GAP = 16

/**
 * The browser scrolls a focused field just above the keyboard, but not above the sticky
 * action bar that now sits there too, so the bar covered the phone input. Scrolls the
 * focused field (with its helper text) clear of the bar.
 */
function keepFocusedFieldVisible() {
  const field = document.activeElement
  if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)) return
  const viewport = window.visualViewport
  const bar = document.querySelector('.cs-bottom-bar')
  const visibleBottom = bar ? bar.getBoundingClientRect().top : (viewport ? viewport.offsetTop + viewport.height : window.innerHeight)
  // Include the line under the field (helper / error text) when it is described by one.
  const describedBy = field.getAttribute('aria-describedby')
  const helper = describedBy ? document.getElementById(describedBy) : null
  const bottom = Math.max(field.getBoundingClientRect().bottom, helper?.getBoundingClientRect().bottom ?? 0)
  const overlap = bottom + FIELD_GAP - visibleBottom
  if (overlap > 0) window.scrollBy({ top: overlap, behavior: 'smooth' })
}

/**
 * iOS Safari keeps the layout viewport when the keyboard opens, so a sticky bottom bar
 * would sit behind it. Publishes the covered height as --cs-keyboard-inset, and keeps the
 * focused field above the bar on every keyboard open (Android and iPhone).
 */
export function useKeyboardInset() {
  useEffect(() => {
    const viewport = window.visualViewport
    const root = document.documentElement
    let settle = 0
    const scheduleReveal = () => { window.clearTimeout(settle); settle = window.setTimeout(keepFocusedFieldVisible, 120) }
    const setInset = () => { if (viewport) root.style.setProperty('--cs-keyboard-inset', `${Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop))}px`) }
    const update = () => { setInset(); scheduleReveal() }
    const onFocus = (event: FocusEvent) => { if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) { scheduleReveal(); window.setTimeout(keepFocusedFieldVisible, 450) } }
    update()
    viewport?.addEventListener('resize', update)
    viewport?.addEventListener('scroll', setInset)
    window.addEventListener('resize', scheduleReveal)
    document.addEventListener('focusin', onFocus)
    return () => {
      window.clearTimeout(settle)
      viewport?.removeEventListener('resize', update)
      viewport?.removeEventListener('scroll', setInset)
      window.removeEventListener('resize', scheduleReveal)
      document.removeEventListener('focusin', onFocus)
      root.style.removeProperty('--cs-keyboard-inset')
    }
  }, [])
}
