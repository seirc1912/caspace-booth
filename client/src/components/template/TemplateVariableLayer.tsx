import { useBranding } from '../../contexts/BrandingContext'
import type { PrintTemplate, TemplateVariable } from '../../types/selfBooth'

interface TemplateVariableLayerProps {
  template: PrintTemplate
}

function resolveVariable(variable: TemplateVariable, brandName: string, website: string) {
  const now = new Date()
  const values: Record<TemplateVariable['type'], string> = {
    brandLogo: '',
    brandName,
    website,
    date: now.toLocaleDateString(),
    time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    qrCode: 'QR',
    customText: variable.value ?? '',
  }
  return values[variable.type]
}

export function TemplateVariableLayer({ template }: TemplateVariableLayerProps) {
  const branding = useBranding()

  return template.variables.map((variable) => {
    if (variable.type === 'brandLogo' && branding.logoUrl) {
      return <img alt="" className="absolute object-contain" key={variable.id} src={branding.logoUrl} style={{ left: `${variable.x / template.canvas.width * 100}%`, top: `${variable.y / template.canvas.height * 100}%`, width: `${variable.width / template.canvas.width * 100}%`, height: `${variable.height / template.canvas.height * 100}%`, zIndex: variable.zIndex }} />
    }

    return (
      <div
        className="pointer-events-none absolute flex items-center overflow-hidden font-bold"
        key={variable.id}
        style={{
          left: `${variable.x / template.canvas.width * 100}%`,
          top: `${variable.y / template.canvas.height * 100}%`,
          width: `${variable.width / template.canvas.width * 100}%`,
          height: `${variable.height / template.canvas.height * 100}%`,
          color: variable.color,
          fontSize: `${variable.fontSize / template.canvas.width * 100}cqw`,
          justifyContent: variable.align === 'left' ? 'flex-start' : variable.align === 'right' ? 'flex-end' : 'center',
          textAlign: variable.align,
          zIndex: variable.zIndex,
        }}
      >
        {resolveVariable(variable, branding.brandName, branding.websiteLabel)}
      </div>
    )
  })
}
