import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent, PointerEvent, WheelEvent } from 'react'
import type { FilledSlot, PrintTemplate, SlotTransform } from '../../types/selfBooth'
import { photoFocus } from '../../features/photos/faceFocus'
import { clampOffset, clampScale, createSlotTransform, effectivePrintDpi, focusTransform, MAX_SLOT_SCALE, MIN_SLOT_SCALE, normalizeQuarterTurn, PRINT_WARNING_DPI, rubberBand, SLOT_SCALE_STEP, zoomAround, type Size } from '../../features/photos/slotTransform'
import { Icon, type IconName } from '../ui/Icon'
import { slotPhotoStyle } from '../../features/photos/slotPhotoStyle'
import { SlotPhoto } from './SlotPhoto'
import { TemplateCanvas } from './TemplateCanvas'

const HINT_KEY = 'caspace.editor.slot-hint.v1'
const DOUBLE_TAP_MS = 300
const KEY_MOVE = 5

interface SlotEditorProps {
  template: PrintTemplate
  backgroundUrl?: string | null
  slots: Array<FilledSlot | null>
  initialIndex: number
  /** "Khung 02" */
  frameName: string
  /** Canvas pixels per printed inch (print-quality warning). */
  templateDpi: number
  /** "Đen trắng tất cả" is on: per-photo B&W is fixed. */
  allBwEnabled: boolean
  /** "✓ Xong": every slot edited during this visit. */
  onDone: (edits: Record<number, SlotTransform>) => void
  /** "Huỷ": nothing is saved. */
  onCancel: () => void
  /** "Thay ảnh": edits so far are saved, then the photo picker opens for this slot. */
  onReplace: (index: number, edits: Record<number, SlotTransform>) => void
}

interface Gesture { pointers: Map<number, { x: number; y: number }>; origin: SlotTransform; startMid: { x: number; y: number }; startDistance: number; moved: boolean }

function ToolButton({ label, icon, onClick, pressed, disabled, busy }: { label: string; icon: IconName; onClick: () => void; pressed?: boolean; disabled?: boolean; busy?: boolean }) {
  return <button aria-pressed={pressed} className={`cs-press flex min-h-[52px] min-w-0 flex-col items-center justify-center gap-1 rounded-[14px] px-1 text-[11px] font-bold leading-tight disabled:opacity-40 ${pressed ? 'cs-led text-white' : 'bg-white/10 text-white'}`} disabled={disabled} onClick={onClick} type="button"><Icon className="size-[18px]" name={icon} /><span>{busy ? 'Đang tìm…' : label}</span></button>
}

const readHintSeen = () => { try { return localStorage.getItem(HINT_KEY) === '1' } catch { return false } }
const writeHintSeen = () => { try { localStorage.setItem(HINT_KEY, '1') } catch { /* private mode: the hint shows again next time */ } }
const midpoint = (points: Array<{ x: number; y: number }>) => ({ x: points.reduce((sum, point) => sum + point.x, 0) / points.length, y: points.reduce((sum, point) => sum + point.y, 0) / points.length })
const spread = (points: Array<{ x: number; y: number }>) => points.length > 1 ? Math.hypot(points[1]!.x - points[0]!.x, points[1]!.y - points[0]!.y) : 0

/**
 * Chỉnh ô (NC-02): one slot as large as the screen allows. Drag, pinch (the photo point under the
 * fingers stays put), double-tap 1× ↔ 2×, wheel, slider, −/+ and arrow keys. The photo always
 * covers the slot. Live movement writes CSS straight to the image inside requestAnimationFrame;
 * React state only changes when a gesture ends.
 */
export function SlotEditor({ template, backgroundUrl, slots, initialIndex, frameName, templateDpi, allBwEnabled, onDone, onCancel, onReplace }: SlotEditorProps) {
  const filledIndices = useMemo(() => slots.map((slot, index) => slot ? index : -1).filter((index) => index >= 0), [slots])
  const [index, setIndex] = useState(initialIndex)
  const [edits, setEdits] = useState<Record<number, { photoId: string; transform: SlotTransform }>>({})
  const slot = slots[index] ?? null
  const templateSlot = template.slots[index]!
  const slotUnits = useMemo(() => ({ width: templateSlot.width, height: templateSlot.height }), [templateSlot.width, templateSlot.height])
  const savedTransform = slot ? (edits[index]?.photoId === slot.photo.id ? edits[index]!.transform : slot.transform) : createSlotTransform()
  const [photoSize, setPhotoSize] = useState<{ photoId: string; size: Size } | null>(null)
  const photo = slot && photoSize?.photoId === slot.photo.id ? photoSize.size : null
  const [windowSize, setWindowSize] = useState<Size | null>(null)
  const [dragging, setDragging] = useState(false)
  const [hintSeen, setHintSeen] = useState(readHintSeen)
  const [fitting, setFitting] = useState(false)
  const area = useRef<HTMLDivElement>(null)
  const image = useRef<HTMLImageElement>(null)
  const live = useRef<SlotTransform>(savedTransform)
  const gesture = useRef<Gesture | null>(null)
  const frame = useRef<number | null>(null)
  const lastTap = useRef({ at: 0, x: 0, y: 0 })
  const wheelCommit = useRef<number | null>(null)

  // Slot switched or saved transform changed (commit, Đặt lại): the live copy follows.
  useEffect(() => { live.current = savedTransform }, [savedTransform])
  useEffect(() => () => { if (frame.current !== null) cancelAnimationFrame(frame.current); if (wheelCommit.current !== null) clearTimeout(wheelCommit.current) }, [])

  // The window keeps the slot's ratio and is as large as the work area allows.
  useLayoutEffect(() => {
    const element = area.current
    if (!element) return
    const measure = () => {
      const ratio = slotUnits.width / slotUnits.height
      const availableWidth = Math.max(80, element.clientWidth - 32)
      const availableHeight = Math.max(80, element.clientHeight - 96)
      const width = Math.min(availableWidth, availableHeight * ratio)
      setWindowSize({ width, height: width / ratio })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [slotUnits.width, slotUnits.height])

  const editsOut = useCallback((extra?: { index: number; transform: SlotTransform }) => {
    const out: Record<number, SlotTransform> = {}
    for (const [key, value] of Object.entries(edits)) if (slots[Number(key)]?.photo.id === value.photoId) out[Number(key)] = value.transform
    if (extra && slots[extra.index]) out[extra.index] = extra.transform
    return out
  }, [edits, slots])

  const commit = useCallback((transform: SlotTransform) => {
    if (!slot) return
    const next = photo ? clampOffset(transform, photo, slotUnits) : transform
    live.current = next
    setEdits((current) => ({ ...current, [index]: { photoId: slot.photo.id, transform: next } }))
  }, [index, photo, slot, slotUnits])

  /** Writes the live transform to the image without a React render. */
  const paint = useCallback((transform: SlotTransform, animate = false) => {
    const element = image.current
    if (!element || !photo) return
    element.style.transition = animate ? 'left .18s ease-out, top .18s ease-out, width .18s ease-out, height .18s ease-out' : ''
    Object.assign(element.style, slotPhotoStyle(transform, photo, slotUnits))
  }, [photo, slotUnits])

  const schedule = (transform: SlotTransform) => {
    live.current = transform
    if (frame.current === null) frame.current = requestAnimationFrame(() => { frame.current = null; paint(live.current) })
  }

  const dismissHint = () => { if (!hintSeen) { setHintSeen(true); writeHintSeen() } }

  // Pointer positions relative to the window centre, in window pixels (= slot units for the maths).
  const local = (event: { clientX: number; clientY: number }) => {
    const rect = area.current!.getBoundingClientRect()
    return { x: event.clientX - rect.left - rect.width / 2, y: event.clientY - rect.top - rect.height / 2 }
  }
  const windowSlot = () => windowSize ?? slotUnits

  const restartGesture = () => {
    const current = gesture.current
    if (!current) return
    const points = [...current.pointers.values()]
    current.origin = live.current
    current.startMid = midpoint(points)
    current.startDistance = spread(points)
  }

  const pointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!photo || !slot) return
    dismissHint()
    event.currentTarget.setPointerCapture(event.pointerId)
    if (!gesture.current) gesture.current = { pointers: new Map(), origin: live.current, startMid: { x: 0, y: 0 }, startDistance: 0, moved: false }
    gesture.current.pointers.set(event.pointerId, local(event))
    restartGesture()
    setDragging(true)
  }

  const pointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const current = gesture.current
    if (!current?.pointers.has(event.pointerId) || !photo) return
    const point = local(event)
    const previous = current.pointers.get(event.pointerId)!
    if (Math.hypot(point.x - previous.x, point.y - previous.y) > 2) current.moved = true
    current.pointers.set(event.pointerId, point)
    const points = [...current.pointers.values()]
    const box = windowSlot()
    const mid = midpoint(points)
    const origin = current.origin
    const scale = points.length > 1 && current.startDistance > 0 ? clampScale(origin.scale * spread(points) / current.startDistance) : origin.scale
    const ratio = scale / origin.scale
    // The photo point that was under startMid is now under mid (pinch zoom + pan in one step).
    const offsetX = mid.x - (current.startMid.x - origin.offsetX / 100 * box.width) * ratio
    const offsetY = mid.y - (current.startMid.y - origin.offsetY / 100 * box.height) * ratio
    schedule(rubberBand({ ...origin, scale, offsetX: offsetX / box.width * 100, offsetY: offsetY / box.height * 100 }, photo, box))
  }

  const pointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const current = gesture.current
    if (!current?.pointers.has(event.pointerId)) return
    const wasTap = !current.moved && current.pointers.size === 1
    const point = local(event)
    current.pointers.delete(event.pointerId)
    if (current.pointers.size) { restartGesture(); return }
    gesture.current = null
    setDragging(false)
    if (frame.current !== null) { cancelAnimationFrame(frame.current); frame.current = null }
    if (!photo) return
    const box = windowSlot()
    if (wasTap) {
      const now = performance.now()
      if (now - lastTap.current.at < DOUBLE_TAP_MS && Math.hypot(point.x - lastTap.current.x, point.y - lastTap.current.y) < 30) {
        lastTap.current.at = 0
        const next = zoomAround(live.current, live.current.scale < 1.5 ? 2 : 1, point, photo, box)
        paint(next, true)
        commit(next)
        return
      }
      lastTap.current = { at: now, x: point.x, y: point.y }
    }
    const settled = clampOffset(live.current, photo, box)
    paint(settled, true)
    commit(settled)
  }

  const wheel = (event: WheelEvent<HTMLDivElement>) => {
    if (!photo) return
    dismissHint()
    const next = zoomAround(live.current, live.current.scale * Math.exp(-event.deltaY * 0.002), local(event), photo, windowSlot())
    schedule(next)
    if (wheelCommit.current !== null) clearTimeout(wheelCommit.current)
    wheelCommit.current = window.setTimeout(() => { wheelCommit.current = null; commit(live.current) }, 160)
  }

  const setScale = (scale: number) => {
    if (!photo) return
    const next = zoomAround(live.current, scale, { x: 0, y: 0 }, photo, windowSlot())
    paint(next, true)
    commit(next)
  }

  const keyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!photo) return
    const moves: Record<string, [number, number]> = { ArrowLeft: [-KEY_MOVE, 0], ArrowRight: [KEY_MOVE, 0], ArrowUp: [0, -KEY_MOVE], ArrowDown: [0, KEY_MOVE] }
    const move = moves[event.key]
    if (move) {
      event.preventDefault()
      const next = clampOffset({ ...live.current, offsetX: live.current.offsetX + move[0], offsetY: live.current.offsetY + move[1] }, photo, windowSlot())
      paint(next, true)
      commit(next)
    } else if (event.key === '+' || event.key === '=') { event.preventDefault(); setScale(live.current.scale + SLOT_SCALE_STEP) }
    else if (event.key === '-' || event.key === '_') { event.preventDefault(); setScale(live.current.scale - SLOT_SCALE_STEP) }
  }

  const fitSlot = async () => {
    if (!photo || !image.current) return
    setFitting(true)
    const base = { ...live.current, scale: 1, offsetX: 0, offsetY: 0 }
    const focus = await photoFocus(image.current)
    setFitting(false)
    const next = focusTransform(base, focus, photo, windowSlot())
    paint(next, true)
    commit(next)
  }
  const update = (change: Partial<SlotTransform>) => { const next = { ...live.current, ...change }; commit(next) }
  const reset = () => commit(createSlotTransform(allBwEnabled || savedTransform.grayscale))
  const switchTo = (next: number) => { if (next !== index && slots[next]) { setIndex(next); setDragging(false); gesture.current = null } }
  const position = filledIndices.indexOf(index)
  const previous = position > 0 ? filledIndices[position - 1] : undefined
  const following = position >= 0 && position < filledIndices.length - 1 ? filledIndices[position + 1] : undefined

  // iOS Safari zooms the whole page on pinch even with touch-action: none; its gesture events must be cancelled.
  useEffect(() => {
    const element = area.current
    if (!element) return
    const block = (event: Event) => event.preventDefault()
    element.addEventListener('gesturestart', block)
    element.addEventListener('gesturechange', block)
    element.addEventListener('touchmove', block, { passive: false })
    return () => { element.removeEventListener('gesturestart', block); element.removeEventListener('gesturechange', block); element.removeEventListener('touchmove', block) }
  }, [])

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => { if (event.key === 'Escape') onCancel() }
    window.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = overflow }
  }, [onCancel])

  const original = slot?.photo.width && slot.photo.height ? { width: slot.photo.width, height: slot.photo.height } : null
  const dpi = original ? effectivePrintDpi(savedTransform, original, slotUnits, templateDpi) : null
  const lowQuality = dpi !== null && dpi < PRINT_WARNING_DPI
  const percent = Math.round(savedTransform.scale * 100)
  const previewSlots = slots.map((item, slotIndex) => item && edits[slotIndex]?.photoId === item.photo.id ? { ...item, transform: edits[slotIndex]!.transform } : item)
  const previewHeight = 64
  const previewWidth = previewHeight * template.canvas.width / template.canvas.height
  const total = template.slots.length


  if (!slot) return null
  return <div aria-label={`Chỉnh ô ${index + 1}`} aria-modal="true" className="fixed inset-0 z-[90] flex flex-col bg-[#0B0C0E] text-white" role="dialog">
    <header className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-1 px-2 pt-[max(6px,env(safe-area-inset-top))]">
      <button className="min-h-11 rounded-xl px-3 text-[15px] font-bold text-white/85" onClick={onCancel} type="button">Huỷ</button>
      <div className="flex min-w-0 items-center justify-center">
        <button aria-label="Ô trước" className="grid size-11 shrink-0 place-items-center rounded-full disabled:opacity-30" disabled={previous === undefined} onClick={() => previous !== undefined && switchTo(previous)} type="button"><Icon className="size-5" name="back" /></button>
        <div className="min-w-0 text-center"><p className="text-[15px] font-black leading-tight">Chỉnh ô {index + 1}</p><p className="cs-mono text-[10px] uppercase tracking-wider text-white/60">{index + 1} / {total} · {frameName}</p></div>
        <button aria-label="Ô sau" className="grid size-11 shrink-0 place-items-center rounded-full disabled:opacity-30" disabled={following === undefined} onClick={() => following !== undefined && switchTo(following)} type="button"><Icon className="size-5" name="chevronRight" /></button>
      </div>
      <button className="min-h-11 rounded-xl px-3 text-[15px] font-bold text-white/85" onClick={reset} type="button">Đặt lại</button>
    </header>

    <div aria-label="Vùng chỉnh ảnh: kéo để di chuyển, chụm hai ngón hoặc lăn chuột để phóng, phím mũi tên để di chuyển, phím + và − để phóng" className="relative min-h-0 flex-1 touch-none select-none overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cs-led" onKeyDown={keyDown} onPointerCancel={pointerUp} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onWheel={wheel} ref={area} role="application" style={{ overscrollBehavior: 'none' }} tabIndex={0}>
      {!hintSeen ? <p className="pointer-events-none absolute inset-x-3 top-2.5 z-20 mx-auto w-fit max-w-full rounded-full bg-white/90 px-3 py-1.5 text-center text-[12px] font-bold leading-snug text-cs-ink">Kéo để di chuyển · Chụm 2 ngón để phóng · Chạm đúp: 2×</p> : null}
      {windowSize ? <div className="absolute left-1/2 top-1/2" style={{ width: windowSize.width, height: windowSize.height, transform: 'translate(-50%, -50%)' }}>
        <SlotPhoto key={slot.photo.id} onSize={(size) => setPhotoSize({ photoId: slot.photo.id, size })} ref={image} slot={slot} slotSize={slotUnits} transform={savedTransform} />
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 border-2 border-white" style={{ boxShadow: '0 0 0 2000px rgba(11,12,14,.62)', borderRadius: templateSlot.mask === 'circle' || templateSlot.mask === 'ellipse' ? '50%' : undefined }}>
          {['-left-[3px] -top-[3px] border-l-[3px] border-t-[3px]', '-right-[3px] -top-[3px] border-r-[3px] border-t-[3px]', '-bottom-[3px] -left-[3px] border-b-[3px] border-l-[3px]', '-bottom-[3px] -right-[3px] border-b-[3px] border-r-[3px]'].map((corner) => <span className={`absolute size-4 border-cs-led ${corner}`} key={corner} />)}
          {dragging ? <><span className="absolute inset-y-0 left-1/3 w-px bg-white/45" /><span className="absolute inset-y-0 left-2/3 w-px bg-white/45" /><span className="absolute inset-x-0 top-1/3 h-px bg-white/45" /><span className="absolute inset-x-0 top-2/3 h-px bg-white/45" /></> : null}
        </div>
      </div> : null}
      <div className="pointer-events-none absolute inset-x-3 bottom-3 z-20 flex items-end justify-between gap-2">
        {lowQuality ? <p className="rounded-[10px] bg-[#F5C842] px-2.5 py-1.5 text-[12px] font-bold leading-snug text-cs-ink" role="status">Phóng lớn quá, ảnh in có thể bị mờ</p> : <span />}
        <span className="cs-mono shrink-0 rounded-full bg-white/15 px-2.5 py-1 text-[12px] font-bold" aria-live="polite">{percent}%</span>
      </div>
    </div>

    <div className="space-y-2 px-3 pb-[max(10px,env(safe-area-inset-bottom))] pt-2">
      <div className="flex items-center gap-2 rounded-[16px] bg-white/10 px-1.5">
        <button aria-label="Thu nhỏ" className="grid size-11 shrink-0 place-items-center rounded-full disabled:opacity-30" disabled={!photo || savedTransform.scale <= MIN_SLOT_SCALE} onClick={() => setScale(savedTransform.scale - SLOT_SCALE_STEP)} type="button"><Icon name="minus" /></button>
        <input aria-label="Mức phóng" aria-valuetext={`${percent}%`} className="h-11 min-w-0 flex-1 accent-[#FF2D55]" disabled={!photo} max={MAX_SLOT_SCALE * 100} min={MIN_SLOT_SCALE * 100} onChange={(event) => setScale(Number(event.currentTarget.value) / 100)} step={1} type="range" value={percent} />
        <button aria-label="Phóng to" className="grid size-11 shrink-0 place-items-center rounded-full disabled:opacity-30" disabled={!photo || savedTransform.scale >= MAX_SLOT_SCALE} onClick={() => setScale(savedTransform.scale + SLOT_SCALE_STEP)} type="button"><Icon name="add" /></button>
      </div>
      <div className="grid grid-cols-5 gap-1.5">
        <ToolButton disabled={!photo || fitting} icon="crop" label="Vừa ô" onClick={() => void fitSlot()} busy={fitting} />
        <ToolButton disabled={!photo} icon="rotate" label="Xoay 90°" onClick={() => update({ rotation: normalizeQuarterTurn(savedTransform.rotation + 90) })} />
        <ToolButton disabled={!photo} icon="flip" label="Lật ngang" onClick={() => update({ flipX: !savedTransform.flipX })} pressed={savedTransform.flipX} />
        <ToolButton disabled={!photo || allBwEnabled} icon="contrast" label="Đen trắng" onClick={() => update({ grayscale: !savedTransform.grayscale })} pressed={savedTransform.grayscale} />
        <ToolButton disabled={!photo} icon="swap" label="Thay ảnh" onClick={() => onReplace(index, editsOut({ index, transform: live.current }))} />
      </div>
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3">
        <div aria-label="Xem trước cả khung: chạm ô khác để chuyển" className="overflow-hidden rounded-[6px]" role="group" style={{ height: previewHeight, width: previewWidth }}>
          <TemplateCanvas backgroundUrl={backgroundUrl} className="rounded-[4px]" highlightSlot={index} mode="preview" onSlotTap={switchTo} slots={previewSlots} template={template} />
        </div>
        <button className="cs-btn-primary cs-press flex min-h-[52px] items-center justify-center gap-2 rounded-[16px] text-[17px] font-black" onClick={() => onDone(editsOut({ index, transform: live.current }))} type="button"><Icon name="check" />Xong</button>
      </div>
    </div>
  </div>
}
