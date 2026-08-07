import { useLayoutEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '../ui/Icon'

interface FrameToolbarProps {
  anchor: HTMLElement | null
  canCrop: boolean
  onCrop: () => void
  onDelete: () => void
  onReplace: () => void
}

export function FrameToolbar({ anchor, canCrop, onCrop, onDelete, onReplace }: FrameToolbarProps) {
  const [position, setPosition] = useState({ left: 0, top: 0, visible: false })
  useLayoutEffect(() => {
    if (!anchor) return
    let frame: number | null = null
    const update = () => {
      if (frame !== null) return
      frame = requestAnimationFrame(() => {
      frame = null
      const rect = anchor.getBoundingClientRect()
      const toolbarWidth = 164
      const left = Math.max(8, Math.min(window.innerWidth - toolbarWidth - 8, rect.left + rect.width / 2 - toolbarWidth / 2))
      const top = rect.top >= 68 ? rect.top - 62 : Math.min(window.innerHeight - 64, rect.bottom + 6)
      setPosition({ left, top, visible: true })
      })
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => { if (frame !== null) cancelAnimationFrame(frame); window.removeEventListener('resize', update); window.removeEventListener('scroll', update, true) }
  }, [anchor])
  if (!anchor || !position.visible) return null
  return createPortal(<div aria-label="Selected frame actions" className="fixed z-[60] flex h-14 items-center gap-1 rounded-[28px] border border-white/60 bg-stone-950/88 px-2 text-white shadow-[0_12px_35px_rgba(28,25,23,.28)] backdrop-blur-xl" onPointerDown={(event) => event.stopPropagation()} role="toolbar" style={{ left: position.left, top: position.top }}><button aria-label="Crop photo" className="grid size-11 place-items-center rounded-full disabled:opacity-35" disabled={!canCrop} onClick={onCrop} type="button"><Icon name="crop" className="size-[21px]" /></button><button aria-label="Replace image from library" className="grid size-11 place-items-center rounded-full hover:bg-white/10" onClick={onReplace} type="button"><Icon name="camera" className="size-[21px]" /></button><button aria-label="Remove image" className="grid size-11 place-items-center rounded-full text-rose-300 hover:bg-white/10" onClick={onDelete} type="button"><Icon name="trash" className="size-[21px]" /></button></div>, document.body)
}
