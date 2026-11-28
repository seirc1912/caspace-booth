import type { PointerEvent } from 'react'
import type { FilledSlot, PrintTemplate, TemplateSlot } from '../../types/selfBooth'
import { photoSlotBackingColor } from '../../features/photos/photoSlotBacking'
import { TemplateSurface } from '../template/TemplateSurface'
import { Icon } from '../ui/Icon'
import { EditorErrorBoundary } from './EditorErrorBoundary'
import { SlotPhoto } from './SlotPhoto'

interface TemplateCanvasProps {
  template: PrintTemplate
  backgroundUrl?: string | null
  slots: Array<FilledSlot | null>
  /**
   * layout: Bố cục — a filled slot opens Chỉnh ô, an empty slot adds the next tray photo. No drag/zoom here.
   * preview: read-only (mini frame in Chỉnh ô, full-screen viewer); `onSlotTap` switches slots.
   */
  mode: 'layout' | 'preview'
  onOpenSlot?: (index: number) => void
  onAddSlot?: (index: number) => void
  onSlotTap?: (index: number) => void
  /** Red outline on the slot being edited (mini preview). */
  highlightSlot?: number | null
  /** Layout: press-and-hold a filled slot to drag it onto another slot (swap). */
  onSlotPointerDown?: (index: number, event: PointerEvent<HTMLButtonElement>) => void
  /** Slot under a dragged tray photo / slot: LED outline. */
  dropTarget?: number | null
  onRemove?: (index: number) => void
  onImageError?: (message: string) => void
  className?: string
}

const slotRadius = (slot: TemplateSlot) => slot.mask === 'circle' || slot.mask === 'ellipse' ? '50%' : `${slot.borderRadius / Math.min(slot.width, slot.height) * 100}%`

export function TemplateCanvas({ template, backgroundUrl, slots, mode, onOpenSlot, onAddSlot, onSlotTap, highlightSlot = null, onSlotPointerDown, dropTarget = null, onRemove = () => undefined, onImageError = () => undefined, className = 'rounded-[6px] shadow-[0_18px_40px_-12px_rgba(0,0,0,.8)]' }: TemplateCanvasProps) {
  const many = template.slots.length > 1
  return <TemplateSurface backgroundUrl={backgroundUrl} className={className} template={template} renderSlot={(templateSlot, index) => {
    const slot = slots[index] ?? null
    const size = { width: templateSlot.width, height: templateSlot.height }
    const number = index + 1
    return <div className="relative h-full w-full overflow-hidden" data-slot-index={index} style={{ backgroundColor: slot ? photoSlotBackingColor : undefined, borderRadius: slotRadius(templateSlot), border: templateSlot.borderWidth ? `${templateSlot.borderWidth}px solid ${templateSlot.borderColor ?? '#000000'}` : undefined, boxShadow: templateSlot.shadow?.blur ? `${templateSlot.shadow.offsetX}px ${templateSlot.shadow.offsetY}px ${templateSlot.shadow.blur}px ${templateSlot.shadow.color}` : undefined }}>
      <EditorErrorBoundary fallback={<button className="grid h-full w-full place-items-center bg-cs-alert-error-bg p-2 text-xs font-bold text-cs-alert-error-fg" onClick={() => onRemove(index)} type="button">Ảnh lỗi · chạm để xoá</button>} onError={onImageError}>
        {slot ? <SlotPhoto loading={mode === 'layout' ? 'lazy' : 'eager'} onError={() => onImageError(`Không hiển thị được ảnh ở ô ${number}.`)} slot={slot} slotSize={size} /> : null}
        {mode === 'layout' ? slot
          ? <button aria-label={`Ô ${number}: chạm để chỉnh ảnh`} className="absolute inset-0 cursor-pointer touch-none select-none [-webkit-touch-callout:none]" onClick={() => onOpenSlot?.(index)} onContextMenu={(event) => event.preventDefault()} onPointerDown={(event) => onSlotPointerDown?.(index, event)} type="button"><span aria-hidden="true" className="absolute bottom-1 right-1 flex items-center gap-0.5 rounded-full bg-cs-ink/70 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white"><Icon className="size-2.5" name="crop" />Chỉnh</span></button>
          : <button aria-label={`Ô ${number}: thêm ảnh`} className="grid h-full w-full place-items-center bg-[#2A2D32] text-white transition-colors hover:bg-[#33363c]" onClick={() => onAddSlot?.(index)} type="button"><span className="grid place-items-center gap-1 text-center">{many ? <span className="cs-mono text-[10px] font-bold uppercase tracking-wider text-white/70">Ô {number}</span> : null}<span className="flex items-center gap-1 text-xs font-bold"><Icon className="size-4" name="add" />Thêm ảnh</span></span></button>
          : onSlotTap && slot ? <button aria-label={`Chỉnh ô ${number}`} aria-current={highlightSlot === index || undefined} className="absolute inset-0" onClick={() => onSlotTap(index)} type="button" /> : !slot ? <div className="h-full w-full bg-[#2A2D32]" /> : null}
        {highlightSlot === index ? <span aria-hidden="true" className="pointer-events-none absolute inset-0 border-2 border-cs-led" /> : null}
        {dropTarget === index ? <span aria-hidden="true" className="pointer-events-none absolute inset-0 border-[3px] border-cs-led bg-cs-led/20 shadow-[inset_0_0_14px_rgba(255,45,85,.5)]" /> : null}
      </EditorErrorBoundary>
    </div>
  }} />
}
