import { useRef } from 'react'
import type { PointerEvent } from 'react'
import type { PrintTemplate, TemplateSlot } from '../../../types/selfBooth'
import { TemplateSurface } from '../../../components/template/TemplateSurface'

interface SlotControlProps {
  selected: boolean
  slot: TemplateSlot
  zoom: number
  onMove: (slotId: string, x: number, y: number) => void
  onResize: (slotId: string, width: number, height: number) => void
  onSelect: (slotId: string, additive: boolean) => void
}

function SlotControl({ selected, slot, zoom, onMove, onResize, onSelect }: SlotControlProps) {
  const origin = useRef<{ x: number; y: number; slotX: number; slotY: number; resize: boolean } | null>(null)
  const start = (event: PointerEvent<HTMLButtonElement>, resize: boolean) => {
    event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId)
    origin.current = { x: event.clientX, y: event.clientY, slotX: resize ? slot.width : slot.x, slotY: resize ? slot.height : slot.y, resize }
    onSelect(slot.id, event.shiftKey)
  }
  const finish = (event: PointerEvent<HTMLButtonElement>) => {
    if (!origin.current) return
    const x = origin.current.slotX + (event.clientX - origin.current.x) / zoom
    const y = origin.current.slotY + (event.clientY - origin.current.y) / zoom
    if (origin.current.resize) onResize(slot.id, x, y); else onMove(slot.id, x, y)
    origin.current = null
  }
  return <button aria-label={`Select ${slot.name ?? slot.id}`} className={`relative h-full w-full border-2 border-dashed bg-white/65 ${selected ? 'border-violet-600 ring-2 ring-violet-500/30' : 'border-stone-400 hover:border-stone-700'}`} onClick={(event) => onSelect(slot.id, event.shiftKey)} onPointerDown={(event) => start(event, false)} onPointerUp={finish} style={{ borderRadius: `${slot.borderRadius / Math.min(slot.width, slot.height) * 100}%` }} type="button"><span className="text-[10px] font-bold text-stone-500">{slot.name ?? 'Photo slot'}</span>{selected && !slot.locked ? <span aria-label="Resize slot" className="absolute -bottom-2 -right-2 size-4 rounded-sm border-2 border-white bg-violet-600" onPointerDown={(event) => { event.stopPropagation(); start(event as unknown as PointerEvent<HTMLButtonElement>, true) }} /> : null}</button>
}

interface StudioCanvasProps {
  template: PrintTemplate
  selectedSlotIds: string[]
  zoom: number
  pan: { x: number; y: number }
  onMove: (slotId: string, x: number, y: number) => void
  onResize: (slotId: string, width: number, height: number) => void
  onSelect: (slotId: string, additive: boolean) => void
  onClearSelection: () => void
}

export function StudioCanvas({ template, selectedSlotIds, zoom, pan, onMove, onResize, onSelect, onClearSelection }: StudioCanvasProps) {
  return <div className="relative h-[65dvh] min-h-[32rem] overflow-auto rounded-2xl bg-stone-200 bg-[radial-gradient(#a8a29e_1px,transparent_1px)] [background-size:20px_20px]" onClick={onClearSelection}><div className="mx-auto w-[min(70vw,36rem)] p-16" style={{ transform: `translate(${pan.x}px,${pan.y}px) scale(${zoom})`, transformOrigin: 'top center' }} onClick={(event) => event.stopPropagation()}><TemplateSurface className="shadow-2xl" renderSlot={(slot) => <SlotControl onMove={onMove} onResize={onResize} onSelect={onSelect} selected={selectedSlotIds.includes(slot.id)} slot={slot} zoom={zoom} />} template={template} /></div></div>
}
