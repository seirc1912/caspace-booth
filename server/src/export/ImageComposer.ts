import sharp from 'sharp'
import type { ExportTransform, TemplateSlot } from './types.js'

export interface ComposedSlot {
  input: Buffer
  left: number
  top: number
}

export class ImageComposer {
  async compose(source: Buffer, slot: TemplateSlot, transform: ExportTransform, scaleX: number, scaleY: number, bleed: number): Promise<ComposedSlot> {
    const width = Math.max(1, Math.round(slot.width * scaleX))
    const height = Math.max(1, Math.round(slot.height * scaleY))
    const zoom = Math.min(5, Math.max(1, transform.zoom))
    const imageWidth = Math.max(width, Math.round(width * zoom))
    const imageHeight = Math.max(height, Math.round(height * zoom))

    const image = await sharp(source, { failOn: 'error' })
      .rotate()
      .resize(imageWidth, imageHeight, { fit: 'cover', position: 'centre' })
      .rotate(transform.rotation, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer({ resolveWithObject: true })

    const left = Math.round((width - image.info.width) / 2 + transform.x * width)
    const top = Math.round((height - image.info.height) / 2 + transform.y * height)
    const radius = Math.max(0, Math.round(slot.borderRadius * Math.min(scaleX, scaleY)))
    const mask = Buffer.from(`<svg width="${width}" height="${height}"><rect width="${width}" height="${height}" rx="${radius}" fill="white"/></svg>`)

    let framed = sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: image.data, left, top }, { input: mask, blend: 'dest-in' }])
      .png()

    if (slot.rotation) framed = framed.rotate(slot.rotation, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
    const rendered = await framed.toBuffer({ resolveWithObject: true })
    const slotCenterX = bleed + (slot.x + slot.width / 2) * scaleX
    const slotCenterY = bleed + (slot.y + slot.height / 2) * scaleY

    return {
      input: rendered.data,
      left: Math.round(slotCenterX - rendered.info.width / 2),
      top: Math.round(slotCenterY - rendered.info.height / 2),
    }
  }
}
