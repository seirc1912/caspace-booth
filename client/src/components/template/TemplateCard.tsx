import type { PrintTemplate } from '../../types/selfBooth'
import { TemplateThumbnail } from './TemplateThumbnail'

interface TemplateCardProps {
  template: PrintTemplate
  printSize?: string
  selected: boolean
  onSelect: () => void
}

export function TemplateCard({ template, printSize, selected, onSelect }: TemplateCardProps) {
  return (
    <button
      aria-pressed={selected}
      className={`group relative rounded-[1.4rem] border bg-white p-2.5 text-left shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900 ${selected ? 'border-stone-950 ring-2 ring-stone-950 ring-offset-2' : 'border-stone-200'}`}
      onClick={onSelect}
      type="button"
    >
      {selected ? <span className="absolute right-4 top-4 z-10 grid size-7 place-items-center rounded-full bg-stone-950 text-sm text-white">&#10003;</span> : null}
      <span className="grid aspect-[3/4] place-items-center overflow-hidden rounded-2xl bg-stone-100">
        <TemplateThumbnail template={template} />
      </span>
      <span className="block px-1 pb-1 pt-3">
        <span className="block font-semibold">{template.name}</span>
        <span className="mt-0.5 block text-sm text-stone-500">{template.slotCount} photo slots</span>
        {printSize ? <span className="mt-1 block text-xs font-semibold text-stone-400">{printSize}</span> : null}
      </span>
    </button>
  )
}
