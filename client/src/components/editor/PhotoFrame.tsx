import { useEffect, useRef } from 'react'
import type { PointerEvent, WheelEvent } from 'react'
import type { FilledSlot, ImageTransform, PhotoSlotEditableRules } from '../../types/selfBooth'
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
  rules?: PhotoSlotEditableRules
}

interface GestureOrigin {
  centroidX: number
  centroidY: number
  distance: number
  angle: number
  transform: ImageTransform
}

const center = (points: Array<{ x: number; y: number }>) => ({ x: points.reduce((sum, point) => sum + point.x, 0) / points.length, y: points.reduce((sum, point) => sum + point.y, 0) / points.length })
const distance = (points: Array<{ x: number; y: number }>) => points[0] && points[1] ? Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y) : 0
const angle = (points: Array<{ x: number; y: number }>) => points[0] && points[1] ? Math.atan2(points[1].y - points[0].y, points[1].x - points[0].x) * 180 / Math.PI : 0
const clampZoom = (value: number) => Math.min(4, Math.max(1, value))

export function PhotoFrame({ index, slot, active, onActivate, onAdd, onRemove, onReplace, onTransform, rules }: PhotoFrameProps) {
  const permissions = rules ?? { canReplace: true, canMove: true, canZoom: true, canRotate: true }
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const origin = useRef<GestureOrigin | null>(null)
  const liveTransform = useRef<ImageTransform | null>(slot?.transform ?? null)
  const animationFrame = useRef<number | null>(null)
  const lastTapAt = useRef(0)
  const pointerMoved = useRef(false)
  useEffect(() => { liveTransform.current = slot?.transform ?? null }, [slot?.transform])
  useEffect(() => () => { if (animationFrame.current !== null) cancelAnimationFrame(animationFrame.current) }, [])

  const beginOrigin = () => {
    const points = Array.from(pointers.current.values())
    const transform = liveTransform.current
    if (!points.length || !transform) return
    const centroid = center(points)
    origin.current = { centroidX: centroid.x, centroidY: centroid.y, distance: distance(points), angle: angle(points), transform: { ...transform } }
  }

  const applyGesture = (target: HTMLDivElement) => {
    animationFrame.current = null
    if (!origin.current || !liveTransform.current) return
    const points = Array.from(pointers.current.values())
    if (!points.length) return
    const centroid = center(points)
    const next: Partial<ImageTransform> = {}
    if (permissions.canMove) {
      next.x = origin.current.transform.x + (centroid.x - origin.current.centroidX) / target.clientWidth
      next.y = origin.current.transform.y + (centroid.y - origin.current.centroidY) / target.clientHeight
    }
    if (points.length >= 2) {
      if (permissions.canZoom && origin.current.distance > 0) next.zoom = clampZoom(origin.current.transform.zoom * distance(points) / origin.current.distance)
      if (permissions.canRotate) next.rotation = origin.current.transform.rotation + angle(points) - origin.current.angle
    }
    liveTransform.current = { ...liveTransform.current, ...next }
    onTransform(next)
  }

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!slot || (!permissions.canMove && !permissions.canZoom && !permissions.canRotate)) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    pointerMoved.current = false
    beginOrigin()
    onActivate()
  }
  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId)) return
    const previous = pointers.current.get(event.pointerId)
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (previous && Math.hypot(event.clientX - previous.x, event.clientY - previous.y) > 2) pointerMoved.current = true
    const target = event.currentTarget
    if (animationFrame.current === null) animationFrame.current = requestAnimationFrame(() => applyGesture(target))
  }
  const reset = () => { const next = { zoom: 1, rotation: 0, x: 0, y: 0, flipX: false, flipY: false }; liveTransform.current = next; onTransform(next) }
  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const wasSinglePointer = pointers.current.size === 1
    if (animationFrame.current !== null) { cancelAnimationFrame(animationFrame.current); animationFrame.current = null }
    pointers.current.delete(event.pointerId)
    if (pointers.current.size) beginOrigin(); else origin.current = null
    if (wasSinglePointer && !pointerMoved.current) {
      const now = Date.now()
      if (now - lastTapAt.current < 320) { reset(); lastTapAt.current = 0 } else lastTapAt.current = now
    }
  }
  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (!slot || !permissions.canZoom) return
    event.preventDefault()
    const zoom = clampZoom((liveTransform.current?.zoom ?? slot.transform.zoom) * Math.exp(-event.deltaY * 0.002))
    liveTransform.current = { ...(liveTransform.current ?? slot.transform), zoom }
    onTransform({ zoom }); onActivate()
  }

  return <div className={`group relative h-full min-h-12 touch-none overflow-hidden bg-stone-100 ring-offset-2 transition-shadow duration-200 ${active ? 'ring-2 ring-[var(--brand-primary)]' : ''}`} onDoubleClick={reset} onPointerCancel={handlePointerUp} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onWheel={handleWheel}>{slot ? <><img alt={slot.photo.alt} className="pointer-events-none absolute inset-0 h-full w-full select-none object-cover will-change-transform" decoding="async" draggable={false} loading="lazy" src={slot.photo.src} style={{ transform: `translate(${slot.transform.x * 100}%, ${slot.transform.y * 100}%) rotate(${slot.transform.rotation}deg) scale(${slot.transform.flipX ? -slot.transform.zoom : slot.transform.zoom}, ${slot.transform.flipY ? -slot.transform.zoom : slot.transform.zoom})` }} /><button aria-label={`Edit photo ${index + 1}`} className="absolute inset-0 cursor-grab active:cursor-grabbing" onClick={onActivate} type="button" />{active ? <div className="absolute inset-x-2 bottom-2 flex items-center justify-center gap-1 rounded-xl bg-stone-950/85 p-1 text-white backdrop-blur" onPointerDown={(event) => event.stopPropagation()}>{permissions.canZoom ? <><button aria-label="Zoom out" className="grid size-9 place-items-center rounded-lg hover:bg-white/15" onClick={() => onTransform({ zoom: Math.max(1, slot.transform.zoom - 0.15) })} type="button"><Icon name="zoomOut" /></button><button aria-label="Zoom in" className="grid size-9 place-items-center rounded-lg hover:bg-white/15" onClick={() => onTransform({ zoom: Math.min(4, slot.transform.zoom + 0.15) })} type="button"><Icon name="zoomIn" /></button></> : null}{permissions.canRotate ? <button aria-label="Rotate" className="grid size-9 place-items-center rounded-lg hover:bg-white/15" onClick={() => onTransform({ rotation: slot.transform.rotation + 90 })} type="button"><Icon name="rotate" /></button> : null}<button aria-label="Flip horizontally" className="grid size-9 place-items-center rounded-lg text-xs font-bold hover:bg-white/15" onClick={() => onTransform({ flipX: !slot.transform.flipX })} type="button">Flip</button>{permissions.canReplace ? <button aria-label="Replace image" className="grid size-9 place-items-center rounded-lg hover:bg-white/15" onClick={onReplace} type="button"><Icon name="camera" /></button> : null}<button aria-label="Remove image" className="grid size-9 place-items-center rounded-lg text-rose-300 hover:bg-white/15" onClick={onRemove} type="button"><Icon name="trash" /></button></div> : null}</> : <button className="grid h-full min-h-12 w-full place-items-center p-2 text-stone-500 transition-colors hover:bg-stone-200/60" onClick={onAdd} type="button"><span className="grid place-items-center gap-1.5"><span className="grid size-9 place-items-center rounded-full bg-white shadow-sm"><Icon name="add" /></span><span className="text-xs font-semibold">Tap to add photo</span></span></button>}</div>
}
