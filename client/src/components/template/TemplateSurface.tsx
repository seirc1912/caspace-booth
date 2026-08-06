import type { ReactNode } from 'react'
import type { PrintTemplate, TemplateSlot } from '../../types/selfBooth'
import { TemplateVariableLayer } from './TemplateVariableLayer'
import { TemplateElementLayer } from './TemplateElementLayer'

interface TemplateSurfaceProps {
  className?: string
  renderSlot: (slot: TemplateSlot, index: number) => ReactNode
  template: PrintTemplate
}

export function TemplateSurface({ className = '', renderSlot, template }: TemplateSurfaceProps) {
  return (
    <div
      className={`relative w-full overflow-hidden bg-cover bg-center [container-type:inline-size] ${className}`}
      style={{
        aspectRatio: `${template.canvas.width} / ${template.canvas.height}`,
        backgroundColor: template.backgroundColor,
        ...(template.backgroundUrl ? { backgroundImage: `url(${template.backgroundUrl})` } : {}),
      }}
    >
      {template.slots.map((slot, index) => slot.visible === false ? null : (
        <div
          className="absolute"
          key={slot.id}
          style={{
            left: `${slot.x / template.canvas.width * 100}%`,
            top: `${slot.y / template.canvas.height * 100}%`,
            width: `${slot.width / template.canvas.width * 100}%`,
            height: `${slot.height / template.canvas.height * 100}%`,
            transform: `rotate(${slot.rotation}deg)`,
            transformOrigin: 'center',
            zIndex: slot.zIndex,
            opacity: slot.opacity ?? 1,
          }}
        >
          {renderSlot(slot, index)}
        </div>
      ))}
      <TemplateVariableLayer template={template} />
      <TemplateElementLayer template={template} />
    </div>
  )
}
