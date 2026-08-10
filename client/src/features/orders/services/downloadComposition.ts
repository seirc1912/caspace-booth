import type { BrandingConfig } from '../../../types/branding'
import type { FilledSlot, PrintTemplate } from '../../../types/selfBooth'
import { renderComposition, type ExportProgress, type ImageExportFormat } from './renderComposition'

interface DownloadCompositionInput {
  branding: BrandingConfig
  format?: ImageExportFormat
  onProgress?: ExportProgress
  slots: Array<FilledSlot | null>
  template: PrintTemplate
}

function timestamp(date = new Date()) {
  const part = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}${part(date.getMonth() + 1)}${part(date.getDate())}-${part(date.getHours())}${part(date.getMinutes())}${part(date.getSeconds())}`
}

export async function downloadComposition({ branding, format = 'png', onProgress, slots, template }: DownloadCompositionInput) {
  if (!slots.length || slots.some((slot) => !slot)) throw new Error('Fill every photo slot before exporting.')
  const rendered = await renderComposition(template, slots, { branding, createPreview: false, format, quality: 0.95, onProgress })
  const filename = `caspace-${timestamp()}.${format}`
  const url = URL.createObjectURL(rendered.print)
  try {
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    anchor.rel = 'noopener'
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }
  return { filename, bytes: rendered.print.size, width: rendered.width, height: rendered.height }
}
