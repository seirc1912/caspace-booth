import { useEffect, useRef } from 'react'
import type { PointerEvent, WheelEvent } from 'react'
import type { FilledSlot, PrintTemplate } from '../../types/selfBooth'
import { Icon } from '../ui/Icon'
import { TemplateCanvas } from './TemplateCanvas'

interface FrameViewerProps {
  template: PrintTemplate
  backgroundUrl?: string | null
  slots: Array<FilledSlot | null>
  onClose: () => void
}

interface View { scale: number; x: number; y: number }

/** ⤢ "Xem toàn màn hình": the whole frame on black; pinch / wheel / double-tap to inspect (view only). */
export function FrameViewer({ template, backgroundUrl, slots, onClose }: FrameViewerProps) {
  const surface = useRef<HTMLDivElement>(null)
  const area = useRef<HTMLDivElement>(null)
  const view = useRef<View>({ scale: 1, x: 0, y: 0 })
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const origin = useRef<{ view: View; mid: { x: number; y: number }; distance: number } | null>(null)
  const lastTap = useRef(0)

  const apply = (next: View) => {
    const scale = Math.min(5, Math.max(1, next.scale))
    view.current = scale === 1 ? { scale, x: 0, y: 0 } : { ...next, scale }
    if (surface.current) surface.current.style.transform = `translate(${view.current.x}px, ${view.current.y}px) scale(${view.current.scale})`
  }
  const center = () => { const rect = area.current!.getBoundingClientRect(); return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } }
  const snapshot = () => {
    const points = [...pointers.current.values()]
    const mid = { x: points.reduce((sum, point) => sum + point.x, 0) / points.length, y: points.reduce((sum, point) => sum + point.y, 0) / points.length }
    const distance = points.length > 1 ? Math.hypot(points[1]!.x - points[0]!.x, points[1]!.y - points[0]!.y) : 0
    return { mid, distance }
  }
  const zoomAt = (point: { x: number; y: number }, scale: number, from = view.current) => {
    const c = center()
    const ratio = Math.min(5, Math.max(1, scale)) / from.scale
    apply({ scale, x: point.x - c.x - (point.x - c.x - from.x) * ratio, y: point.y - c.y - (point.y - c.y - from.y) * ratio })
  }

  const down = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    origin.current = { view: view.current, ...snapshot() }
  }
  const move = (event: PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId) || !origin.current) return
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    const { mid, distance } = snapshot()
    const start = origin.current
    const scale = start.distance > 0 && distance > 0 ? start.view.scale * distance / start.distance : start.view.scale
    const c = center()
    const ratio = Math.min(5, Math.max(1, scale)) / start.view.scale
    apply({ scale, x: mid.x - c.x - (start.mid.x - c.x - start.view.x) * ratio, y: mid.y - c.y - (start.mid.y - c.y - start.view.y) * ratio })
  }
  const up = (event: PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId)
    origin.current = pointers.current.size ? { view: view.current, ...snapshot() } : null
    if (!pointers.current.size) {
      const now = performance.now()
      if (now - lastTap.current < 300) { zoomAt({ x: event.clientX, y: event.clientY }, view.current.scale > 1 ? 1 : 2.5); lastTap.current = 0 } else lastTap.current = now
    }
  }
  const wheel = (event: WheelEvent<HTMLDivElement>) => zoomAt({ x: event.clientX, y: event.clientY }, view.current.scale * Math.exp(-event.deltaY * 0.002))

  useEffect(() => {
    const element = area.current
    const block = (event: Event) => event.preventDefault()
    element?.addEventListener('gesturestart', block)
    element?.addEventListener('touchmove', block, { passive: false })
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { element?.removeEventListener('gesturestart', block); element?.removeEventListener('touchmove', block); window.removeEventListener('keydown', onKey); document.body.style.overflow = overflow }
  }, [onClose])

  const ratio = template.canvas.width / template.canvas.height
  return <div aria-label="Xem cả khung" aria-modal="true" className="fixed inset-0 z-[95] bg-black" role="dialog">
    <div className="absolute inset-0 touch-none overflow-hidden" onPointerCancel={up} onPointerDown={down} onPointerMove={move} onPointerUp={up} onWheel={wheel} ref={area}>
      <div className="absolute left-1/2 top-1/2" style={{ width: `min(calc(100vw - 32px), calc((100dvh - 96px) * ${ratio}))`, transform: 'translate(-50%, -50%)' }}>
        <div className="origin-center" ref={surface}><TemplateCanvas backgroundUrl={backgroundUrl} className="rounded-[4px]" mode="preview" slots={slots} template={template} /></div>
      </div>
    </div>
    <p className="cs-mono pointer-events-none absolute inset-x-0 bottom-[max(16px,env(safe-area-inset-bottom))] text-center text-[11px] text-white/60">Chụm 2 ngón hoặc chạm đúp để soi chi tiết</p>
    <button aria-label="Đóng xem toàn màn hình" className="absolute right-3 top-[max(12px,env(safe-area-inset-top))] grid size-11 place-items-center rounded-full bg-white/15 text-white" onClick={onClose} type="button"><Icon name="close" /></button>
  </div>
}
