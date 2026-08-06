import { useRef } from 'react'
import type { PointerEvent } from 'react'
import { TemplateSurface } from '../../../components/template/TemplateSurface'
import type { PrintTemplate, TemplateElement, TemplateGuideSettings, TemplateSlot } from '../../../types/selfBooth'
import { CanvasGuides } from './CanvasGuides'

interface PointerOrigin {
  clientX: number
  clientY: number
  valueX: number
  valueY: number
  resize: boolean
}

interface ObjectControlProps {
  id: string
  name: string
  locked: boolean
  selected: boolean
  zoom: number
  x: number
  y: number
  width: number
  height: number
  onChange: (id: string, changes: { x: number; y: number } | { width: number; height: number }) => void
  onSelect: (id: string, additive: boolean) => void
}

function ObjectControl({ id, name, locked, selected, zoom, x, y, width, height, onChange, onSelect }: ObjectControlProps) {
  const origin = useRef<PointerOrigin | null>(null)
  const start = (event: PointerEvent<HTMLButtonElement>, resize: boolean) => {
    event.stopPropagation()
    onSelect(id, event.shiftKey)
    if (locked) return
    event.currentTarget.setPointerCapture(event.pointerId)
    origin.current = { clientX: event.clientX, clientY: event.clientY, valueX: resize ? width : x, valueY: resize ? height : y, resize }
  }
  const finish = (event: PointerEvent<HTMLButtonElement>) => {
    if (!origin.current) return
    const nextX = origin.current.valueX + (event.clientX - origin.current.clientX) / zoom
    const nextY = origin.current.valueY + (event.clientY - origin.current.clientY) / zoom
    onChange(id, origin.current.resize ? { width: Math.max(20, nextX), height: Math.max(20, nextY) } : { x: nextX, y: nextY })
    origin.current = null
  }
  return <button aria-label={`Select ${name}`} className={`h-full w-full border-2 bg-transparent ${selected ? 'border-violet-600 ring-2 ring-violet-500/30' : 'border-transparent hover:border-violet-300'}`} onClick={(event) => onSelect(id, event.shiftKey)} onPointerDown={(event) => start(event, false)} onPointerUp={finish} type="button"><span className="sr-only">{name}</span>{selected && !locked ? <span aria-label={`Resize ${name}`} className="absolute -bottom-2 -right-2 size-4 rounded-sm border-2 border-white bg-violet-600" onPointerDown={(event) => start(event as unknown as PointerEvent<HTMLButtonElement>, true)} /> : null}</button>
}

interface StudioCanvasProps {
  template: PrintTemplate
  selectedSlotIds: string[]
  zoom: number
  pan: { x: number; y: number }
  guides: TemplateGuideSettings
  onMove: (slotId: string, x: number, y: number) => void
  onResize: (slotId: string, width: number, height: number) => void
  onElementChange: (elementId: string, changes: Partial<TemplateElement>) => void
  onSelect: (slotId: string, additive: boolean) => void
  onClearSelection: () => void
}

export function StudioCanvas({ template, selectedSlotIds, zoom, pan, guides, onMove, onResize, onElementChange, onSelect, onClearSelection }: StudioCanvasProps) {
  const updateSlot = (id: string, changes: { x: number; y: number } | { width: number; height: number }) => {
    if ('x' in changes) onMove(id, changes.x, changes.y)
    else onResize(id, changes.width, changes.height)
  }
  const updateElement = (id: string, changes: { x: number; y: number } | { width: number; height: number }) => onElementChange(id, changes)
  const position = (object: TemplateSlot | TemplateElement) => ({ left: `${object.x / template.canvas.width * 100}%`, top: `${object.y / template.canvas.height * 100}%`, width: `${object.width / template.canvas.width * 100}%`, height: `${object.height / template.canvas.height * 100}%` })

  return <div className="relative h-[65dvh] min-h-[32rem] overflow-auto rounded-2xl bg-stone-200 bg-[radial-gradient(#a8a29e_1px,transparent_1px)] [background-size:20px_20px]" onClick={onClearSelection}><div className="mx-auto w-[min(70vw,36rem)] p-16" onClick={(event) => event.stopPropagation()} style={{ transform: `translate(${pan.x}px,${pan.y}px) scale(${zoom})`, transformOrigin: 'top center' }}><div className="relative"><TemplateSurface className="shadow-2xl" renderSlot={(slot) => <div className="relative h-full w-full"><ObjectControl height={slot.height} id={slot.id} locked={slot.locked ?? false} name={slot.name ?? 'Photo slot'} onChange={updateSlot} onSelect={onSelect} selected={selectedSlotIds.includes(slot.id)} width={slot.width} x={slot.x} y={slot.y} zoom={zoom} /></div>} template={template} /><CanvasGuides settings={guides} />{template.elements.filter((element) => element.visible).map((element) => <div className="absolute z-[101]" key={element.id} style={position(element)}><ObjectControl height={element.height} id={element.id} locked={element.locked} name={element.name} onChange={updateElement} onSelect={onSelect} selected={selectedSlotIds.includes(element.id)} width={element.width} x={element.x} y={element.y} zoom={zoom} /></div>)}</div></div></div>
}
