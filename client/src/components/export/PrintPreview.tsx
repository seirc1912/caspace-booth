import type { FilledSlot, PrintTemplate } from '../../types/selfBooth'
import { TemplateCanvas } from '../editor/TemplateCanvas'

interface PrintPreviewProps {
  slots: Array<FilledSlot | null>
  template: PrintTemplate
}

const noAction = () => undefined

export function PrintPreview({ slots, template }: PrintPreviewProps) {
  return (
    <figure>
      <div className="relative mx-auto w-full max-w-md p-5">
        <TemplateCanvas activeSlot={null} onActiveSlotChange={noAction} onAdd={noAction} onRemove={noAction} onReplace={noAction} onTransform={noAction} readonly slots={slots} template={template} />
        <div aria-label="Bleed area" className="pointer-events-none absolute inset-3 border border-dotted border-sky-500" />
        <div aria-label="Safe area" className="pointer-events-none absolute inset-8 border border-dashed border-emerald-500" />
        <div aria-label="Crop marks" className="pointer-events-none absolute inset-5">
          <span className="absolute -left-3 top-0 h-px w-5 bg-stone-950" /><span className="absolute left-0 -top-3 h-5 w-px bg-stone-950" />
          <span className="absolute -right-3 top-0 h-px w-5 bg-stone-950" /><span className="absolute right-0 -top-3 h-5 w-px bg-stone-950" />
          <span className="absolute -bottom-3 left-0 h-5 w-px bg-stone-950" /><span className="absolute -left-3 bottom-0 h-px w-5 bg-stone-950" />
          <span className="absolute -bottom-3 right-0 h-5 w-px bg-stone-950" /><span className="absolute -right-3 bottom-0 h-px w-5 bg-stone-950" />
        </div>
      </div>
      <figcaption className="mt-2 flex flex-wrap justify-center gap-4 text-xs text-stone-500">
        <span><i className="mr-1.5 inline-block size-2 rounded-full bg-emerald-500" />Safe area</span>
        <span><i className="mr-1.5 inline-block size-2 rounded-full bg-sky-500" />Bleed area</span>
        <span><i className="mr-1.5 inline-block size-2 rounded-full bg-stone-950" />Crop marks</span>
      </figcaption>
    </figure>
  )
}
