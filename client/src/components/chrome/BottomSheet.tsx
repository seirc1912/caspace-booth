import { useEffect, useId, type ReactNode } from 'react'
import { Icon } from '../ui/Icon'

interface BottomSheetProps {
  title: string
  subtitle?: ReactNode
  onClose: () => void
  closeDisabled?: boolean
  children: ReactNode
  footer?: ReactNode
}

export function BottomSheet({ title, subtitle, onClose, closeDisabled = false, children, footer }: BottomSheetProps) {
  const titleId = useId()
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !closeDisabled) onClose() }
    window.addEventListener('keydown', onKey)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = previous }
  }, [closeDisabled, onClose])
  return <div aria-labelledby={titleId} aria-modal="true" className="fixed inset-0 z-[80] flex items-end justify-center bg-[rgba(13,14,16,.55)]" role="dialog">
    <button aria-hidden="true" className="absolute inset-0 cursor-default" disabled={closeDisabled} onClick={onClose} tabIndex={-1} type="button" />
    <div className="cs-panel relative flex max-h-[88dvh] w-full max-w-[430px] flex-col rounded-t-[28px] text-cs-ink">
      <div className="px-4 pt-2"><span aria-hidden="true" className="mx-auto block h-1 w-10 rounded-full bg-cs-chrome-400" /></div>
      <div className="flex items-start justify-between gap-3 px-4 pt-2">
        <div className="min-w-0 pt-2"><h2 className="text-lg font-black tracking-[-0.02em]" id={titleId}>{title}</h2>{subtitle ? <div className="mt-1 text-sm leading-snug text-cs-ink-3">{subtitle}</div> : null}</div>
        <button aria-label="Đóng" className="cs-btn-chrome cs-press grid size-11 shrink-0 place-items-center rounded-full disabled:opacity-50" disabled={closeDisabled} onClick={onClose} type="button"><Icon name="close" /></button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 pt-3">{children}</div>
      {footer ? <div className="border-t border-white px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-3 shadow-[0_-1px_0_rgba(0,0,0,.1)]">{footer}</div> : null}
    </div>
  </div>
}
