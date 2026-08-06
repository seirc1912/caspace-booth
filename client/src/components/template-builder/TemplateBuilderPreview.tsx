import type { DragEvent } from 'react'
import type { PrintTemplate } from '../../types/selfBooth'
import { TemplateSurface } from '../template/TemplateSurface'

interface TemplateBuilderPreviewProps {
  selectedSlotId: string | null
  template: PrintTemplate
  onSelectSlot: (slotId: string) => void
  onDropPhoto?: (slotId: string, photoId: string) => void
  placeholderPhotos?: Record<string, string>
}

export function TemplateBuilderPreview({ selectedSlotId, template, onSelectSlot, onDropPhoto, placeholderPhotos = {} }: TemplateBuilderPreviewProps) {
  const handleDrop = (event: DragEvent<HTMLButtonElement>, slotId: string) => {
    event.preventDefault()
    const photoId = event.dataTransfer.getData('application/x-selfbooth-photo')
    if (photoId) onDropPhoto?.(slotId, photoId)
  }

  return (
    <TemplateSurface
      className="rounded-2xl shadow-xl shadow-stone-900/10"
      renderSlot={(slot) => (
        <button
          aria-label={`Edit slot ${slot.id}`}
          className={`grid h-full w-full place-items-center overflow-hidden border-2 border-dashed bg-white/70 text-xs font-semibold text-stone-500 transition ${selectedSlotId === slot.id ? 'border-[var(--brand-primary)] ring-2 ring-[var(--brand-primary)]/20' : 'border-stone-400 hover:border-stone-700'}`}
          onClick={() => onSelectSlot(slot.id)}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => handleDrop(event, slot.id)}
          style={{ borderRadius: `${slot.borderRadius / Math.min(slot.width, slot.height) * 100}%` }}
          type="button"
        >
          {placeholderPhotos[slot.id] ? <img alt="Placeholder preview" className="h-full w-full object-cover" src={placeholderPhotos[slot.id]} /> : 'Drop photo'}
        </button>
      )}
      template={template}
    />
  )
}
