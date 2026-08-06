import type { PrintTemplate } from '../../types/selfBooth'
import { TemplateSurface } from './TemplateSurface'

interface TemplateThumbnailProps {
  template: PrintTemplate
}

export function TemplateThumbnail({ template }: TemplateThumbnailProps) {
  if (template.thumbnailUrl) {
    return <img alt={`${template.name} template`} className="block aspect-[3/4] w-full rounded-2xl object-cover" src={template.thumbnailUrl} />
  }

  return (
    <TemplateSurface
      className="rounded-2xl"
      renderSlot={(slot, index) => (
        <span className="relative block h-full w-full overflow-hidden bg-stone-200" style={{ borderRadius: `${slot.borderRadius / Math.min(slot.width, slot.height) * 100}%` }}>
          <span className={`absolute inset-0 bg-gradient-to-br ${index % 3 === 0 ? 'from-rose-200 via-orange-100 to-sky-200' : index % 3 === 1 ? 'from-violet-200 via-pink-100 to-amber-100' : 'from-cyan-100 via-teal-200 to-indigo-200'}`} />
          <span className="absolute bottom-[-10%] left-1/2 h-3/4 w-3/4 -translate-x-1/2 rounded-t-full bg-white/45" />
        </span>
      )}
      template={template}
    />
  )
}
