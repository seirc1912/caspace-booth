import type { PrintTemplate, TemplateElement } from '../../types/selfBooth'

interface TemplateElementLayerProps {
  template: PrintTemplate
}

function content(element: TemplateElement) {
  if (element.type === 'qrCode') return 'QR'
  if (element.type === 'dynamicVariable') return `{${element.variableType ?? 'customText'}}`
  return element.content ?? ''
}

export function TemplateElementLayer({ template }: TemplateElementLayerProps) {
  return template.elements.filter((element) => element.visible).map((element) => {
    const style = {
      left: `${element.x / template.canvas.width * 100}%`, top: `${element.y / template.canvas.height * 100}%`,
      width: `${element.width / template.canvas.width * 100}%`, height: `${element.height / template.canvas.height * 100}%`,
      opacity: element.opacity, transform: `rotate(${element.rotation}deg)`, zIndex: element.zIndex,
    }
    if ((element.type === 'image' || element.type === 'logo' || element.type === 'sticker' || element.type === 'overlay') && element.assetUrl) return <img alt="" className="pointer-events-none absolute object-contain" key={element.id} src={element.assetUrl} style={style} />
    if (element.type === 'shape') return <div className={`pointer-events-none absolute ${element.shape === 'circle' ? 'rounded-full' : ''}`} key={element.id} style={{ ...style, background: element.shape === 'line' ? undefined : element.fill, borderTop: element.shape === 'line' ? `2px solid ${element.stroke}` : undefined, border: element.shape !== 'line' ? `1px solid ${element.stroke ?? 'transparent'}` : undefined }} />
    return <div className="pointer-events-none absolute flex items-center overflow-hidden" key={element.id} style={{ ...style, color: element.color, fontFamily: element.fontFamily, fontSize: `${(element.fontSize ?? 32) / template.canvas.width * 100}cqw`, fontWeight: element.fontWeight, justifyContent: element.textAlign === 'right' ? 'flex-end' : element.textAlign === 'center' ? 'center' : 'flex-start', letterSpacing: element.letterSpacing, textShadow: element.shadowBlur ? `${element.shadowX ?? 0}px ${element.shadowY ?? 0}px ${element.shadowBlur}px ${element.shadowColor ?? '#000000'}` : undefined }}>{content(element)}</div>
  })
}
