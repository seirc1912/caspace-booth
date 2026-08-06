import { useRef } from 'react'
import type { PointerEvent, WheelEvent } from 'react'
import type { FilledSlot, ImageTransform } from '../../types/selfBooth'
import { Icon } from '../ui/Icon'

interface PhotoFrameProps {
  index: number
  slot: FilledSlot | null
  active: boolean
  onActivate: () => void
  onAdd: () => void
  onRemove: () => void
  onReplace: () => void
  onTransform: (transform: Partial<ImageTransform>) => void
}

export function PhotoFrame({ index, slot, active, onActivate, onAdd, onRemove, onReplace, onTransform }: PhotoFrameProps) {
  const pointerOrigin = useRef<{ x: number; y: number; slotX: number; slotY: number } | null>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const pinchOrigin = useRef<{ distance: number; zoom: number } | null>(null)
  const lastTapAt = useRef(0)
  const pointerMoved = useRef(false)

  const distanceBetweenPointers = () => {
    const points = Array.from(pointers.current.values())
    if (!points[0] || !points[1]) return 0
    return Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y)
  }

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!slot) return
    event.currentTarget.setPointerCapture(event.pointerId)
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    pointerMoved.current = false
    pointerOrigin.current = { x: event.clientX, y: event.clientY, slotX: slot.transform.x, slotY: slot.transform.y }
    if (pointers.current.size === 2) {
      pinchOrigin.current = { distance: distanceBetweenPointers(), zoom: slot.transform.zoom }
    }
    onActivate()
  }

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!slot || !pointers.current.has(event.pointerId)) return
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })

    if (pointers.current.size >= 2 && pinchOrigin.current) {
      const distance = distanceBetweenPointers()
      if (pinchOrigin.current.distance > 0) {
        onTransform({ zoom: Math.min(3, Math.max(1, pinchOrigin.current.zoom * distance / pinchOrigin.current.distance)) })
      }
      pointerMoved.current = true
      return
    }

    if (!pointerOrigin.current) return
    const deltaX = event.clientX - pointerOrigin.current.x
    const deltaY = event.clientY - pointerOrigin.current.y
    if (Math.hypot(deltaX, deltaY) > 4) pointerMoved.current = true
    onTransform({
      x: pointerOrigin.current.slotX + deltaX / event.currentTarget.clientWidth,
      y: pointerOrigin.current.slotY + deltaY / event.currentTarget.clientHeight,
    })
  }

  const reset = () => onTransform({ zoom: 1, rotation: 0, x: 0, y: 0 })

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const wasSinglePointer = pointers.current.size === 1
    pointers.current.delete(event.pointerId)
    pointerOrigin.current = null
    pinchOrigin.current = null

    if (wasSinglePointer && !pointerMoved.current) {
      const now = Date.now()
      if (now - lastTapAt.current < 320) {
        reset()
        lastTapAt.current = 0
      } else {
        lastTapAt.current = now
      }
    }
  }

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (!slot) return
    event.preventDefault()
    const zoom = slot.transform.zoom * Math.exp(-event.deltaY * 0.002)
    onTransform({ zoom: Math.min(3, Math.max(1, zoom)) })
    onActivate()
  }

  return (
    <div
      className={`group relative h-full min-h-12 touch-none overflow-hidden bg-stone-100 ring-offset-2 transition-shadow duration-200 ${active ? 'ring-2 ring-[var(--brand-primary)]' : ''}`}
      onDoubleClick={reset}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerCancel={handlePointerUp}
      onPointerUp={handlePointerUp}
      onWheel={handleWheel}
    >
      {slot ? (
        <>
          <img
            alt={slot.photo.alt}
            className="pointer-events-none absolute inset-0 h-full w-full select-none object-cover transition-transform duration-100"
            draggable={false}
            src={slot.photo.src}
            style={{ transform: `translate(${slot.transform.x * 100}%, ${slot.transform.y * 100}%) rotate(${slot.transform.rotation}deg) scale(${slot.transform.zoom})` }}
          />
          <button aria-label={`Edit photo ${index + 1}`} className="absolute inset-0 cursor-grab active:cursor-grabbing" onClick={onActivate} type="button" />
          {active ? (
            <div className="absolute inset-x-2 bottom-2 flex items-center justify-center gap-1 rounded-xl bg-stone-950/85 p-1 text-white backdrop-blur" onPointerDown={(event) => event.stopPropagation()}>
              <button aria-label="Zoom out" className="grid size-9 place-items-center rounded-lg hover:bg-white/15" onClick={() => onTransform({ zoom: Math.max(1, slot.transform.zoom - 0.15) })} type="button"><Icon name="zoomOut" /></button>
              <button aria-label="Zoom in" className="grid size-9 place-items-center rounded-lg hover:bg-white/15" onClick={() => onTransform({ zoom: Math.min(3, slot.transform.zoom + 0.15) })} type="button"><Icon name="zoomIn" /></button>
              <button aria-label="Rotate" className="grid size-9 place-items-center rounded-lg hover:bg-white/15" onClick={() => onTransform({ rotation: slot.transform.rotation + 90 })} type="button"><Icon name="rotate" /></button>
              <button aria-label="Replace image" className="grid size-9 place-items-center rounded-lg hover:bg-white/15" onClick={onReplace} type="button"><Icon name="camera" /></button>
              <button aria-label="Remove image" className="grid size-9 place-items-center rounded-lg text-rose-300 hover:bg-white/15" onClick={onRemove} type="button"><Icon name="trash" /></button>
            </div>
          ) : null}
        </>
      ) : (
        <button className="grid h-full min-h-12 w-full place-items-center p-2 text-stone-500 transition-colors hover:bg-stone-200/60" onClick={onAdd} type="button">
          <span className="grid place-items-center gap-1.5">
            <span className="grid size-9 place-items-center rounded-full bg-white shadow-sm"><Icon name="add" /></span>
            <span className="text-xs font-semibold">Tap to add photo</span>
          </span>
        </button>
      )}
    </div>
  )
}
