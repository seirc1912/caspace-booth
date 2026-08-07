import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, MouseEvent, PointerEvent, WheelEvent } from 'react'
import { TemplateSurface } from '../../../components/template/TemplateSurface'
import type { PrintTemplate, TemplateElement, TemplateGuideSettings, TemplateSlot } from '../../../types/selfBooth'
import { CanvasGuides } from './CanvasGuides'
import { CanvasRulers } from './CanvasRulers'

type Geometry = Pick<TemplateSlot, 'x' | 'y' | 'width' | 'height' | 'rotation'> & { borderRadius?: number }
type Handle = 'move' | 'rotate' | 'radius' | 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'
type AlignmentGuide = { axis: 'x' | 'y'; value: number }
type ContextAction = 'duplicate' | 'delete' | 'forward' | 'backward' | 'copy' | 'paste'

interface Gesture {
  handle: Handle
  pointerId: number
  clientX: number
  clientY: number
  geometry: Geometry
  centerX: number
  centerY: number
  startAngle: number
}

interface ObjectControlProps {
  id: string
  name: string
  locked: boolean
  selected: boolean
  zoom: number
  geometry: Geometry
  canvas: { width: number; height: number }
  onCommit: (id: string, geometry: Geometry) => void
  onContextMenu: (event: MouseEvent, id: string) => void
  onDoubleClick: (id: string) => void
  onPreview: (id: string, geometry: Geometry) => { geometry: Geometry; guides: AlignmentGuide[] }
  onSelect: (id: string, additive: boolean) => void
  onGuides: (guides: AlignmentGuide[]) => void
}

const selectionBlue = '#0D99FF'
const handleClass = 'absolute z-20 size-3 rounded-full border-2 border-white bg-[#0D99FF] shadow-[0_1px_3px_rgba(15,23,42,.35)] transition-transform hover:scale-125'
const handles: Array<{ id: Handle; className: string; cursor: string }> = [
  { id: 'nw', className: '-left-1.5 -top-1.5', cursor: 'nwse-resize' }, { id: 'n', className: 'left-1/2 -top-1.5 -translate-x-1/2', cursor: 'ns-resize' },
  { id: 'ne', className: '-right-1.5 -top-1.5', cursor: 'nesw-resize' }, { id: 'e', className: '-right-1.5 top-1/2 -translate-y-1/2', cursor: 'ew-resize' },
  { id: 'se', className: '-bottom-1.5 -right-1.5', cursor: 'nwse-resize' }, { id: 's', className: '-bottom-1.5 left-1/2 -translate-x-1/2', cursor: 'ns-resize' },
  { id: 'sw', className: '-bottom-1.5 -left-1.5', cursor: 'nesw-resize' }, { id: 'w', className: '-left-1.5 top-1/2 -translate-y-1/2', cursor: 'ew-resize' },
]

function resizeGeometry(origin: Geometry, handle: Handle, dx: number, dy: number, keepRatio: boolean, fromCenter: boolean): Geometry {
  const minimum = 20
  let left = origin.x; let top = origin.y; let right = origin.x + origin.width; let bottom = origin.y + origin.height
  if (handle.includes('w')) left += dx
  if (handle.includes('e')) right += dx
  if (handle.includes('n')) top += dy
  if (handle.includes('s')) bottom += dy
  if (fromCenter) {
    if (handle.includes('w')) right -= dx
    if (handle.includes('e')) left -= dx
    if (handle.includes('n')) bottom -= dy
    if (handle.includes('s')) top -= dy
  }
  if (right - left < minimum) { if (handle.includes('w')) left = right - minimum; else right = left + minimum }
  if (bottom - top < minimum) { if (handle.includes('n')) top = bottom - minimum; else bottom = top + minimum }
  if (keepRatio) {
    const ratio = origin.width / origin.height
    const width = right - left; const height = bottom - top
    if (Math.abs(dx) >= Math.abs(dy)) {
      const nextHeight = width / ratio; const delta = nextHeight - height
      if (handle.includes('n')) top -= delta
      else if (handle.includes('s')) bottom += delta
      else { top -= delta / 2; bottom += delta / 2 }
    } else {
      const nextWidth = height * ratio; const delta = nextWidth - width
      if (handle.includes('w')) left -= delta
      else if (handle.includes('e')) right += delta
      else { left -= delta / 2; right += delta / 2 }
    }
  }
  return { ...origin, x: left, y: top, width: Math.max(minimum, right - left), height: Math.max(minimum, bottom - top) }
}

const ObjectControl = memo(function ObjectControl({ id, name, locked, selected, zoom, geometry, canvas, onCommit, onContextMenu, onDoubleClick, onPreview, onSelect, onGuides }: ObjectControlProps) {
  const gesture = useRef<Gesture | null>(null)
  const frame = useRef<number | null>(null)
  const latestEvent = useRef<PointerEvent<HTMLButtonElement> | null>(null)
  const draftRef = useRef<Geometry | null>(null)
  const [draft, setDraft] = useState<Geometry | null>(null)
  const [angle, setAngle] = useState<number | null>(null)
  const current = draft ?? geometry

  const process = useCallback(() => {
    frame.current = null
    const event = latestEvent.current; const active = gesture.current
    if (!event || !active) return
    const dx = (event.clientX - active.clientX) / zoom
    const dy = (event.clientY - active.clientY) / zoom
    let next: Geometry
    if (active.handle === 'move') next = { ...active.geometry, x: active.geometry.x + dx, y: active.geometry.y + dy }
    else if (active.handle === 'rotate') {
      const degrees = Math.atan2(event.clientY - active.centerY, event.clientX - active.centerX) * 180 / Math.PI
      let rotation = active.geometry.rotation + degrees - active.startAngle
      if (event.shiftKey) rotation = Math.round(rotation / 15) * 15
      next = { ...active.geometry, rotation: Math.round(rotation * 10) / 10 }
      setAngle(next.rotation)
    } else if (active.handle === 'radius') {
      next = { ...active.geometry, borderRadius: Math.round(Math.min(Math.max(0, (active.geometry.borderRadius ?? 0) + Math.max(dx, dy)), Math.min(active.geometry.width, active.geometry.height) / 2)) }
    } else next = resizeGeometry(active.geometry, active.handle, dx, dy, event.shiftKey, event.altKey)
    const preview = onPreview(id, next)
    draftRef.current = preview.geometry
    const rendered = document.querySelector<HTMLElement>(`[data-studio-render="${CSS.escape(id)}"]`)
    if (rendered) Object.assign(rendered.style, { left: `${preview.geometry.x / canvas.width * 100}%`, top: `${preview.geometry.y / canvas.height * 100}%`, width: `${preview.geometry.width / canvas.width * 100}%`, height: `${preview.geometry.height / canvas.height * 100}%`, transform: `rotate(${preview.geometry.rotation}deg)` })
    const placeholder = document.querySelector<HTMLElement>(`[data-studio-placeholder="${CSS.escape(id)}"]`)
    if (placeholder && preview.geometry.borderRadius !== undefined) placeholder.style.borderRadius = `${preview.geometry.borderRadius / Math.min(preview.geometry.width, preview.geometry.height) * 100}%`
    setDraft(preview.geometry)
    onGuides(preview.guides)
  }, [canvas.height, canvas.width, id, onGuides, onPreview, zoom])

  const start = (event: PointerEvent<HTMLButtonElement>, handle: Handle) => {
    event.preventDefault(); event.stopPropagation(); onSelect(id, event.shiftKey)
    if (locked) return
    event.currentTarget.setPointerCapture(event.pointerId)
    const rect = event.currentTarget.closest('[data-studio-control]')?.getBoundingClientRect()
    const centerX = rect ? rect.left + rect.width / 2 : event.clientX
    const centerY = rect ? rect.top + rect.height / 2 : event.clientY
    gesture.current = { handle, pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, geometry, centerX, centerY, startAngle: Math.atan2(event.clientY - centerY, event.clientX - centerX) * 180 / Math.PI }
  }
  const move = (event: PointerEvent<HTMLButtonElement>) => {
    if (!gesture.current) return
    latestEvent.current = event
    if (frame.current === null) frame.current = requestAnimationFrame(process)
  }
  const finish = (event: PointerEvent<HTMLButtonElement>) => {
    if (!gesture.current) return
    if (frame.current !== null) { cancelAnimationFrame(frame.current); frame.current = null; latestEvent.current = event; process() }
    const final = draftRef.current
    gesture.current = null; setAngle(null); onGuides([])
    if (final) { onCommit(id, final); draftRef.current = null; setDraft(null) }
  }
  const style: CSSProperties = { left: `${current.x / canvas.width * 100}%`, top: `${current.y / canvas.height * 100}%`, width: `${current.width / canvas.width * 100}%`, height: `${current.height / canvas.height * 100}%`, transform: `rotate(${current.rotation}deg)` }
  const radiusPosition = Math.min(Math.max(current.borderRadius ?? 0, Math.min(current.width, current.height) * .08), Math.min(current.width, current.height) / 2)
  return <div className="pointer-events-none absolute z-[200]" data-studio-control={id} style={style}><button aria-label={`Select ${name}`} className={`pointer-events-auto absolute inset-0 border-2 bg-transparent transition-[border-color,box-shadow] duration-100 ${selected ? 'border-[#0D99FF] shadow-[0_0_0_1px_rgba(255,255,255,.95)]' : 'border-transparent hover:border-[#0D99FF]/60 hover:bg-[#0D99FF]/[.04]'}`} onContextMenu={(event) => { event.preventDefault(); onContextMenu(event, id) }} onDoubleClick={(event) => { event.stopPropagation(); onDoubleClick(id) }} onPointerCancel={finish} onPointerDown={(event) => start(event, 'move')} onPointerMove={move} onPointerUp={finish} style={{ cursor: locked ? 'default' : 'move', touchAction: 'none' }} type="button"><span className="sr-only">{name}</span></button>{selected && !locked ? <>{handles.map((handle) => <button aria-label={`${handle.id} resize ${name}`} className={`${handleClass} ${handle.className} pointer-events-auto`} key={handle.id} onPointerCancel={finish} onPointerDown={(event) => start(event, handle.id)} onPointerMove={move} onPointerUp={finish} style={{ cursor: handle.cursor, touchAction: 'none' }} type="button" />)}{current.borderRadius !== undefined ? <button aria-label={`Adjust corner radius for ${name}`} className="pointer-events-auto absolute z-30 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-[#0D99FF] shadow-[0_1px_3px_rgba(15,23,42,.35)] transition-transform hover:scale-125" onPointerCancel={finish} onPointerDown={(event) => start(event, 'radius')} onPointerMove={move} onPointerUp={finish} style={{ cursor: 'nwse-resize', left: `${radiusPosition / current.width * 100}%`, top: `${radiusPosition / current.height * 100}%`, touchAction: 'none' }} title="Drag to adjust corner radius" type="button" /> : null}<div className="pointer-events-none absolute bottom-full left-1/2 h-7 w-px -translate-x-1/2" style={{ backgroundColor: selectionBlue }} /><button aria-label={`Rotate ${name}`} className="pointer-events-auto absolute -top-10 left-1/2 size-4 -translate-x-1/2 rounded-full border-2 border-white bg-[#0D99FF] shadow-[0_1px_3px_rgba(15,23,42,.35)] transition-transform hover:scale-110" onPointerCancel={finish} onPointerDown={(event) => start(event, 'rotate')} onPointerMove={move} onPointerUp={finish} style={{ cursor: 'grab', touchAction: 'none' }} type="button" />{angle !== null ? <span className="pointer-events-none absolute -top-16 left-1/2 -translate-x-1/2 rounded bg-stone-950 px-2 py-1 text-[11px] font-bold text-white">{Math.round(angle)}°</span> : null}</> : null}</div>
})

function PhotoSlotPlaceholder({ slot }: { slot: TemplateSlot }) {
  const isEllipse = slot.mask === 'circle' || slot.mask === 'ellipse'
  return <div className="grid size-full place-items-center overflow-hidden border border-[#0D99FF]/20 bg-[#e8f5ff] text-center text-[#0878c9]" data-studio-placeholder={slot.id} style={{ borderRadius: isEllipse ? '50%' : `${slot.borderRadius / Math.min(slot.width, slot.height) * 100}%`, clipPath: isEllipse ? 'ellipse(50% 50% at 50% 50%)' : undefined }}><div className="flex max-w-[90%] flex-col items-center gap-[.35em] px-2"><svg aria-hidden="true" className="h-[clamp(1.25rem,7cqw,3rem)] w-[clamp(1.25rem,7cqw,3rem)]" fill="none" viewBox="0 0 48 48"><rect height="34" rx="5" stroke="currentColor" strokeWidth="2.5" width="40" x="4" y="7" /><circle cx="16" cy="18" fill="currentColor" r="4" /><path d="m8 36 10-10 7 7 5-5 10 8" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" /></svg><div><strong className="block text-[clamp(.55rem,3.2cqw,1rem)] leading-tight">Photo Slot</strong><span className="mt-1 block text-[clamp(.42rem,2.2cqw,.75rem)] leading-tight opacity-80">Drop image or double click</span></div></div></div>
}

interface StudioCanvasProps {
  template: PrintTemplate
  selectedSlotIds: string[]
  zoom: number
  pan: { x: number; y: number }
  guides: TemplateGuideSettings
  onElementChange: (id: string, changes: Partial<TemplateElement>) => void
  onSlotChange: (id: string, changes: Partial<TemplateSlot>) => void
  onSelect: (id: string, additive: boolean) => void
  onClearSelection: () => void
  onDoubleClick: (id: string) => void
  onContextAction: (action: ContextAction, id: string | null) => void
  onViewportChange: (zoom: number, pan: { x: number; y: number }) => void
}

export function StudioCanvas({ template, selectedSlotIds, zoom, pan, guides, onElementChange, onSlotChange, onSelect, onClearSelection, onDoubleClick, onContextAction, onViewportChange }: StudioCanvasProps) {
  const viewport = useRef<HTMLDivElement>(null)
  const panning = useRef<{ x: number; y: number; panX: number; panY: number; pointerId: number } | null>(null)
  const spacePressed = useRef(false)
  const [alignmentGuides, setAlignmentGuides] = useState<AlignmentGuide[]>([])
  const [menu, setMenu] = useState<{ x: number; y: number; id: string | null } | null>(null)
  const objects = useMemo(() => [...template.slots, ...template.elements], [template.elements, template.slots])

  useEffect(() => {
    const down = (event: KeyboardEvent) => { if (event.code === 'Space' && !['INPUT', 'TEXTAREA', 'SELECT'].includes((event.target as HTMLElement).tagName)) { event.preventDefault(); spacePressed.current = true } }
    const up = (event: KeyboardEvent) => { if (event.code === 'Space') spacePressed.current = false }
    window.addEventListener('keydown', down); window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  }, [])

  const preview = useCallback((id: string, draft: Geometry) => {
    const grid = (value: number) => guides.snapToGrid ? Math.round(value / guides.gridSize) * guides.gridSize : value
    const snappedDraft = { ...draft, x: grid(draft.x), y: grid(draft.y), width: grid(draft.width), height: grid(draft.height) }
    const tolerance = 8 / zoom
    const xTargets = [0, template.canvas.width / 2, template.canvas.width]
    const yTargets = [0, template.canvas.height / 2, template.canvas.height]
    objects.forEach((item) => { if (item.id !== id) { xTargets.push(item.x, item.x + item.width / 2, item.x + item.width); yTargets.push(item.y, item.y + item.height / 2, item.y + item.height) } })
    const xPoints = [snappedDraft.x, snappedDraft.x + snappedDraft.width / 2, snappedDraft.x + snappedDraft.width]
    const yPoints = [snappedDraft.y, snappedDraft.y + snappedDraft.height / 2, snappedDraft.y + snappedDraft.height]
    let xDelta = 0; let yDelta = 0; let bestX = tolerance + 1; let bestY = tolerance + 1; const nextGuides: AlignmentGuide[] = []
    xPoints.forEach((point) => xTargets.forEach((target) => { const distance = Math.abs(target - point); if (distance < bestX && distance <= tolerance) { bestX = distance; xDelta = target - point; nextGuides[0] = { axis: 'x', value: target } } }))
    yPoints.forEach((point) => yTargets.forEach((target) => { const distance = Math.abs(target - point); if (distance < bestY && distance <= tolerance) { bestY = distance; yDelta = target - point; nextGuides[1] = { axis: 'y', value: target } } }))
    return { geometry: { ...snappedDraft, x: snappedDraft.x + xDelta, y: snappedDraft.y + yDelta }, guides: nextGuides.filter(Boolean) }
  }, [guides.gridSize, guides.snapToGrid, objects, template.canvas.height, template.canvas.width, zoom])

  const commit = useCallback((id: string, next: Geometry) => {
    if (template.slots.some((slot) => slot.id === id)) onSlotChange(id, next)
    else {
      const elementGeometry = { x: next.x, y: next.y, width: next.width, height: next.height, rotation: next.rotation }
      onElementChange(id, elementGeometry)
    }
  }, [onElementChange, onSlotChange, template.slots])
  const wheel = (event: WheelEvent<HTMLDivElement>) => {
    if (!event.ctrlKey) return
    event.preventDefault()
    const rect = event.currentTarget.getBoundingClientRect(); const px = event.clientX - rect.left - rect.width / 2; const py = event.clientY - rect.top - rect.height / 2
    const nextZoom = Math.min(8, Math.max(.2, zoom * Math.exp(-event.deltaY * .003)))
    const ratio = nextZoom / zoom
    onViewportChange(nextZoom, { x: px - (px - pan.x) * ratio, y: py - (py - pan.y) * ratio })
  }
  const startPan = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 1 && !(event.button === 0 && spacePressed.current)) return
    event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); panning.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y, pointerId: event.pointerId }
  }
  const movePan = (event: PointerEvent<HTMLDivElement>) => { const active = panning.current; if (active) onViewportChange(zoom, { x: active.panX + event.clientX - active.x, y: active.panY + event.clientY - active.y }) }
  const stopPan = () => { panning.current = null }
  const contextMenu = useCallback((event: MouseEvent, id: string) => setMenu({ x: event.clientX, y: event.clientY, id }), [])
  const stageStyle: CSSProperties = { width: 'min(36rem, 48vw)', left: `calc(50% + ${pan.x}px)`, top: `calc(50% + ${pan.y}px)`, transform: `translate(-50%, -50%) scale(${zoom})`, transformOrigin: 'center' }

  return <div className="relative h-[65dvh] min-h-[32rem] overflow-hidden rounded-2xl bg-stone-200 bg-[radial-gradient(#a8a29e_1px,transparent_1px)] [background-size:20px_20px]" onContextMenu={(event) => { if (event.target === event.currentTarget) { event.preventDefault(); setMenu({ x: event.clientX, y: event.clientY, id: null }) } }} onPointerDown={(event) => { setMenu(null); startPan(event); if (event.target === event.currentTarget && !spacePressed.current) onClearSelection() }} onPointerMove={movePan} onPointerUp={stopPan} onWheel={wheel} ref={viewport} style={{ cursor: 'default', overscrollBehavior: 'none' }}><div className="absolute" style={stageStyle}><div className="relative"><TemplateSurface className="shadow-2xl" renderSlot={(slot) => <PhotoSlotPlaceholder slot={slot} />} template={template} /><CanvasGuides settings={guides} /><CanvasRulers height={template.canvas.height} width={template.canvas.width} />{alignmentGuides.map((guide) => <div className={`pointer-events-none absolute z-[300] bg-fuchsia-500 ${guide.axis === 'x' ? 'inset-y-[-100vh] w-px' : 'inset-x-[-100vw] h-px'}`} key={`${guide.axis}-${guide.value}`} style={guide.axis === 'x' ? { left: `${guide.value / template.canvas.width * 100}%` } : { top: `${guide.value / template.canvas.height * 100}%` }} />)}{objects.filter((object) => object.visible !== false).map((object) => <ObjectControl canvas={template.canvas} geometry={object} id={object.id} key={object.id} locked={object.locked ?? false} name={object.name ?? 'Photo slot'} onCommit={commit} onContextMenu={contextMenu} onDoubleClick={onDoubleClick} onGuides={setAlignmentGuides} onPreview={preview} onSelect={onSelect} selected={selectedSlotIds.includes(object.id)} zoom={zoom} />)}</div></div>{menu ? <div className="fixed z-[1000] grid min-w-44 overflow-hidden rounded-xl border border-stone-200 bg-white p-1 text-sm shadow-2xl" onPointerDown={(event) => event.stopPropagation()} style={{ left: menu.x, top: menu.y }}>{(['duplicate', 'copy', 'paste', 'forward', 'backward', 'delete'] as const).map((action) => <button className={`rounded-lg px-3 py-2 text-left capitalize hover:bg-stone-100 ${action === 'delete' ? 'text-rose-600' : ''}`} disabled={!menu.id && action !== 'paste'} key={action} onClick={() => { onContextAction(action, menu.id); setMenu(null) }} type="button">{action === 'forward' ? 'Bring forward' : action === 'backward' ? 'Send backward' : action}</button>)}</div> : null}</div>
}
