import { memo, useEffect, useRef, useState } from 'react'
import type { DragEvent, PointerEvent, WheelEvent } from 'react'
import type { FilledSlot, ImageTransform, PhotoSlotEditableRules } from '../../types/selfBooth'
import { Icon } from '../ui/Icon'
import { FrameToolbar } from './FrameToolbar'

interface PhotoFrameProps {
  index: number
  slot: FilledSlot | null
  active: boolean
  cropMode: boolean
  onActivate: () => void
  onAdd: () => void
  onBeginCrop: () => void
  onDropPhoto: (photoId: string) => void
  onImageError: (message: string) => void
  onRemove: () => void
  onReset: () => void
  onReplace: () => void
  onTransform: (transform: Partial<ImageTransform>) => void
  rules?: PhotoSlotEditableRules
}

interface GestureOrigin { centroidX: number; centroidY: number; distance: number; angle: number; transform: ImageTransform }
const center = (points: Array<{ x: number; y: number }>) => ({ x: points.reduce((sum, point) => sum + point.x, 0) / points.length, y: points.reduce((sum, point) => sum + point.y, 0) / points.length })
const distance = (points: Array<{ x: number; y: number }>) => points[0] && points[1] ? Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y) : 0
const angle = (points: Array<{ x: number; y: number }>) => points[0] && points[1] ? Math.atan2(points[1].y - points[0].y, points[1].x - points[0].x) * 180 / Math.PI : 0
const clampZoom = (value: number) => Math.min(6, Math.max(0.25, value))

export const PhotoFrame = memo(function PhotoFrame({ index, slot, active, cropMode, onActivate, onAdd, onBeginCrop, onDropPhoto, onImageError, onRemove, onReset, onReplace, onTransform, rules }: PhotoFrameProps) {
  const permissions = rules ?? { canReplace: true, canMove: true, canZoom: true, canRotate: true }
  const displaySrc = slot?.photo.previewSrc ?? slot?.photo.src ?? ''
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const origin = useRef<GestureOrigin | null>(null)
  const liveTransform = useRef<ImageTransform | null>(slot?.transform ?? null)
  const animationFrame = useRef<number | null>(null)
  const frameElement = useRef<HTMLDivElement>(null)
  const lastTapAt = useRef(0)
  const pointerMoved = useRef(false)
  const [imageFailed, setImageFailed] = useState(false)
  const [imageReady, setImageReady] = useState(false)
  useEffect(() => { liveTransform.current = slot?.transform ?? null }, [slot?.transform])
  useEffect(() => { setImageFailed(false); setImageReady(false) }, [displaySrc])
  useEffect(() => () => { if (animationFrame.current !== null) cancelAnimationFrame(animationFrame.current) }, [])

  const beginOrigin = () => {
    const points = Array.from(pointers.current.values()); const transform = liveTransform.current
    if (!points.length || !transform) return
    const centroid = center(points)
    origin.current = { centroidX: centroid.x, centroidY: centroid.y, distance: distance(points), angle: angle(points), transform: { ...transform } }
  }
  const applyGesture = (target: HTMLDivElement) => {
    animationFrame.current = null
    if (!cropMode || !origin.current || !liveTransform.current) return
    const points = Array.from(pointers.current.values()); if (!points.length) return
    const centroid = center(points); const next: Partial<ImageTransform> = {}
    if (points.length === 1 && permissions.canMove) {
      next.x = origin.current.transform.x + (centroid.x - origin.current.centroidX) / target.clientWidth
      next.y = origin.current.transform.y + (centroid.y - origin.current.centroidY) / target.clientHeight
    } else if (points.length >= 2) {
      if (permissions.canZoom && origin.current.distance > 0) next.zoom = clampZoom(origin.current.transform.zoom * distance(points) / origin.current.distance)
      if (permissions.canRotate) next.rotation = origin.current.transform.rotation + angle(points) - origin.current.angle
    }
    liveTransform.current = { ...liveTransform.current, ...next }; onTransform(next)
  }
  const pointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!slot) return
    if (!cropMode) return
    onActivate()
    pointerMoved.current = false
    event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId)
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY }); beginOrigin()
  }
  const pointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId)) return
    const previous = pointers.current.get(event.pointerId)
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (previous && Math.hypot(event.clientX - previous.x, event.clientY - previous.y) > 3) pointerMoved.current = true
    const target = event.currentTarget
    if (animationFrame.current === null) animationFrame.current = requestAnimationFrame(() => applyGesture(target))
  }
  const pointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const wasSinglePointer = pointers.current.size === 1
    if (animationFrame.current !== null) { cancelAnimationFrame(animationFrame.current); animationFrame.current = null; applyGesture(event.currentTarget) }
    pointers.current.delete(event.pointerId)
    if (pointers.current.size) beginOrigin(); else origin.current = null
    if (cropMode && wasSinglePointer && !pointerMoved.current) {
      const now = Date.now()
      if (now - lastTapAt.current < 320) { onReset(); lastTapAt.current = 0 } else lastTapAt.current = now
    }
  }
  const wheel = (event: WheelEvent<HTMLDivElement>) => {
    if (!slot || !cropMode || !permissions.canZoom) return
    event.preventDefault(); const zoom = clampZoom((liveTransform.current?.zoom ?? slot.transform.zoom) * Math.exp(-event.deltaY * 0.002))
    liveTransform.current = { ...(liveTransform.current ?? slot.transform), zoom }; onTransform({ zoom })
  }
  const drop = (event: DragEvent<HTMLDivElement>) => {
    const photoId = event.dataTransfer.getData('application/x-selfbooth-photo')
    if (!photoId) return
    event.preventDefault(); onDropPhoto(photoId)
  }
  const activateFilledFrame = () => {
    onActivate()
    if (!cropMode && imageReady && window.matchMedia('(max-width: 767px)').matches) onBeginCrop()
  }

  return <><div ref={frameElement} className={`group relative h-full min-h-12 overflow-hidden bg-stone-100 ring-offset-2 transition-shadow duration-200 ${cropMode ? 'touch-none ring-4 ring-sky-500' : 'touch-manipulation'} ${active && !cropMode ? 'ring-2 ring-[var(--brand-primary)]' : ''}`} onDoubleClick={() => slot && imageReady && onBeginCrop()} onDragOver={(event) => event.preventDefault()} onDrop={drop} onPointerCancel={pointerUp} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onWheel={wheel}>
    {slot ? <>{!imageFailed && displaySrc ? <img alt={slot.photo.alt} className={`pointer-events-none absolute inset-0 h-full w-full select-none ${slot.fit === 'cover' ? 'object-cover' : 'object-contain'} `} decoding="async" draggable={false} loading="lazy" onLoad={() => setImageReady(true)} onError={() => { setImageFailed(true); onImageError(`${slot.photo.alt || 'This image'} could not be displayed.`) }} src={displaySrc} style={{ transform: `translate(${slot.transform.x * 100}%, ${slot.transform.y * 100}%) rotate(${slot.transform.rotation}deg) scale(${slot.transform.flipX ? -slot.transform.zoom : slot.transform.zoom}, ${slot.transform.flipY ? -slot.transform.zoom : slot.transform.zoom})`, transformOrigin: 'center center' }} /> : <div className="absolute inset-0 grid place-items-center bg-rose-50 p-2 text-center text-xs font-bold text-rose-600">Image unavailable</div>}<button aria-label={`Select frame ${index + 1}`} className={`absolute inset-0 ${cropMode ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'}`} onClick={activateFilledFrame} type="button" /></> : <button className="grid h-full min-h-12 w-full place-items-center p-2 text-sky-600 transition-colors hover:bg-sky-50" onClick={onAdd} type="button"><span className="grid place-items-center gap-1.5"><span className="grid size-10 place-items-center rounded-xl bg-sky-100"><Icon name="camera" /></span><span className="text-xs font-bold">Add Image</span></span></button>}
  </div>{active && slot && !cropMode ? <FrameToolbar anchor={frameElement.current} canCrop={imageReady && !imageFailed} onCrop={onBeginCrop} onDelete={onRemove} onReplace={onReplace} /> : null}</>
})
