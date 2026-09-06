import type { BrandingConfig } from '../../../types/branding'
import type { FilledSlot, PrintTemplate } from '../../../types/selfBooth'
import { downloadBlob } from './downloadBlob'
import { renderComposition, type ExportProgress, type ImageExportFormat } from './renderComposition'

export interface DownloadCompositionInput {
  branding: BrandingConfig
  format?: ImageExportFormat
  onProgress?: ExportProgress
  slots: Array<FilledSlot | null>
  template: PrintTemplate
}

export interface PreparedCompositionDownload {
  blob: Blob
  filename: string
  bytes: number
  width: number
  height: number
}

function timestamp(date = new Date()) {
  const part = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}${part(date.getMonth() + 1)}${part(date.getDate())}-${part(date.getHours())}${part(date.getMinutes())}${part(date.getSeconds())}`
}

export async function prepareCompositionDownload({ branding, format = 'png', onProgress, slots, template }: DownloadCompositionInput): Promise<PreparedCompositionDownload> {
  if (!slots.length || slots.some((slot) => !slot)) throw new Error('Fill every photo slot before exporting.')
  const rendered = await renderComposition(template, slots, { branding, createPreview: false, format, quality: 0.95, onProgress })
  const filename = `caspace-${timestamp()}.${format}`
  return { blob: rendered.print, filename, bytes: rendered.print.size, width: rendered.width, height: rendered.height }
}

export async function downloadComposition(input: DownloadCompositionInput) {
  const prepared = await prepareCompositionDownload(input)
  downloadBlob(prepared.blob, prepared.filename)
  return { filename: prepared.filename, bytes: prepared.bytes, width: prepared.width, height: prepared.height }
}
