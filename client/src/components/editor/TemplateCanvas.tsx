import type { FilledSlot, ImageTransform, PrintTemplate } from '../../types/selfBooth'
import { TemplateSurface } from '../template/TemplateSurface'
import { PhotoFrame } from './PhotoFrame'

interface TemplateCanvasProps {
  template: PrintTemplate
  slots: Array<FilledSlot | null>
  activeSlot: number | null
  onActiveSlotChange: (index: number) => void
  onAdd: (index: number) => void
  onRemove: (index: number) => void
  onReplace: (index: number) => void
  onTransform: (index: number, transform: Partial<ImageTransform>) => void
  readonly?: boolean
}

export function TemplateCanvas({ template, slots, activeSlot, onActiveSlotChange, onAdd, onRemove, onReplace, onTransform, readonly = false }: TemplateCanvasProps) {
  return (
    <TemplateSurface
      className="rounded-[1.75rem] shadow-xl shadow-stone-900/10"
      renderSlot={(templateSlot, index) => {
        const slot = slots[index] ?? null
        const borderRadius = `${templateSlot.borderRadius / Math.min(templateSlot.width, templateSlot.height) * 100}%`

        return (
          <div className="h-full w-full overflow-hidden" style={{ borderRadius }}>
            {readonly && slot ? (
              <img alt={slot.photo.alt} className="h-full w-full object-cover" src={slot.photo.src} style={{ transform: `translate(${slot.transform.x * 100}%, ${slot.transform.y * 100}%) rotate(${slot.transform.rotation}deg) scale(${slot.transform.flipX ? -slot.transform.zoom : slot.transform.zoom}, ${slot.transform.flipY ? -slot.transform.zoom : slot.transform.zoom})` }} />
            ) : (
              <PhotoFrame
                active={activeSlot === index}
                index={index}
                onActivate={() => onActiveSlotChange(index)}
                onAdd={() => onAdd(index)}
                onRemove={() => onRemove(index)}
                onReplace={() => onReplace(index)}
                onTransform={(transform) => onTransform(index, transform)}
                rules={templateSlot.editableRules}
                slot={slot}
              />
            )}
          </div>
        )
      }}
      template={template}
    />
  )
}
