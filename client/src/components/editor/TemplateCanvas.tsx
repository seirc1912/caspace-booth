import type { FilledSlot, ImageTransform, PrintTemplate } from '../../types/selfBooth'
import { photoSlotBackingColor } from '../../features/photos/photoSlotBacking'
import { TemplateSurface } from '../template/TemplateSurface'
import { PhotoFrame } from './PhotoFrame'
import { EditorErrorBoundary } from './EditorErrorBoundary'
import { CustomerPhotoLayer } from './CustomerPhotoLayer'

interface TemplateCanvasProps {
  template: PrintTemplate
  slots: Array<FilledSlot | null>
  activeSlot: number | null
  cropSlot?: number | null
  onActiveSlotChange: (index: number) => void
  onAdd: (index: number) => void
  onRemove: (index: number) => void
  onReset?: (index: number) => void
  onReplace: (index: number) => void
  onBeginCrop?: (index: number) => void
  onDropPhoto?: (index: number, photoId: string) => void
  onImageError?: (message: string) => void
  onTransform: (index: number, transform: Partial<ImageTransform>) => void
  readonly?: boolean
}

export function TemplateCanvas({ template, slots, activeSlot, cropSlot = null, onActiveSlotChange, onAdd, onRemove, onReset = () => undefined, onReplace, onBeginCrop = () => undefined, onDropPhoto = () => undefined, onImageError = () => undefined, onTransform, readonly = false }: TemplateCanvasProps) {
  return (
    <TemplateSurface
      className="rounded-[1.75rem] shadow-xl shadow-stone-900/10"
      renderSlot={(templateSlot, index) => {
        const slot = slots[index] ?? null
        const borderRadius = templateSlot.mask === 'circle' || templateSlot.mask === 'ellipse' ? '50%' : `${templateSlot.borderRadius / Math.min(templateSlot.width, templateSlot.height) * 100}%`

        return (
          <div className="h-full w-full overflow-hidden" style={{ backgroundColor: slot ? photoSlotBackingColor : undefined, borderRadius, border: templateSlot.borderWidth ? `${templateSlot.borderWidth}px solid ${templateSlot.borderColor ?? '#000000'}` : undefined, boxShadow: templateSlot.shadow?.blur ? `${templateSlot.shadow.offsetX}px ${templateSlot.shadow.offsetY}px ${templateSlot.shadow.blur}px ${templateSlot.shadow.color}` : undefined }}>
            {readonly && slot ? (
              <CustomerPhotoLayer slot={slot} />
            ) : (
              <EditorErrorBoundary fallback={<button className="grid h-full w-full place-items-center bg-rose-50 p-2 text-xs font-bold text-rose-600" onClick={() => onRemove(index)} type="button">Remove unavailable image</button>} onError={onImageError}><PhotoFrame
                active={activeSlot === index}
                cropMode={cropSlot === index}
                index={index}
                onActivate={() => onActiveSlotChange(index)}
                onAdd={() => onAdd(index)}
                onBeginCrop={() => onBeginCrop(index)}
                onDropPhoto={(photoId) => onDropPhoto(index, photoId)}
                onImageError={onImageError}
                onRemove={() => onRemove(index)}
                onReset={() => onReset(index)}
                onReplace={() => onReplace(index)}
                onTransform={(transform) => onTransform(index, transform)}
                rules={templateSlot.editableRules}
                slot={slot}
              /></EditorErrorBoundary>
            )}
          </div>
        )
      }}
      template={template}
    />
  )
}
