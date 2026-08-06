import type { AdminTemplateRecord } from '../types'
import { serializeTemplate } from '../../template-builder/model/templateBuilder'

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url)
}

async function asset(url: string | null, filename: string, width: number, height: number, color: string) {
  if (url) { const response = await fetch(url); if (response.ok) return download(await response.blob(), filename) }
  const canvas = document.createElement('canvas'); canvas.width = Math.min(width, 2400); canvas.height = Math.min(height, 2400); const context = canvas.getContext('2d')!; context.fillStyle = color; context.fillRect(0, 0, canvas.width, canvas.height)
  const blob = await new Promise<Blob>((resolve) => canvas.toBlob((value) => resolve(value!), 'image/png')); download(blob, filename)
}

export async function downloadTemplatePackage(record: AdminTemplateRecord) {
  const { template } = record
  download(new Blob([serializeTemplate(template)], { type: 'application/json' }), 'template.json')
  await asset(template.backgroundUrl, 'background.png', template.canvas.width, template.canvas.height, template.backgroundColor)
  await asset(template.thumbnailUrl, 'thumbnail.png', 600, 800, template.backgroundColor)
  await asset(record.coverUrl, 'cover.png', 1200, 675, template.backgroundColor)
}
