import { readFile } from 'node:fs/promises'
import { PDFDocument } from 'pdf-lib'
import sharp from 'sharp'
import { ImageComposer } from './ImageComposer.js'
import { PrintCanvas } from './PrintCanvas.js'
import type { ExportManifest, ExportTemplate, TemplateVariable } from './types.js'

const escapeXml = (value: string) => value.replace(/[<>&'"]/g, (character) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[character]!)

export class RenderEngine {
  constructor(private readonly imageComposer = new ImageComposer()) {}

  async render(manifest: ExportManifest, template: ExportTemplate, templateDirectory: string, images: Map<string, Buffer>): Promise<Buffer> {
    const canvas = new PrintCanvas(manifest.settings, template)
    const backgroundPath = `${templateDirectory}/${template.assets.background}`
    const background = await readFile(backgroundPath)
    const base = sharp(background).resize(canvas.width, canvas.height, { fit: 'fill' }).ensureAlpha()

    const composed = await Promise.all(template.slots.map(async (slot, index) => {
      const assignment = manifest.slots[index]
      if (!assignment) return null
      const source = images.get(assignment.fieldName)
      if (!source) throw new Error(`Missing original image for slot ${slot.id}`)
      return this.imageComposer.compose(source, slot, assignment.transform, canvas.scaleX, canvas.scaleY, canvas.bleed)
    }))

    const variableLayer = this.createVariableLayer(template.variables, manifest, canvas)
    const printPng = await base
      .composite([
        ...composed.filter((item): item is NonNullable<typeof item> => Boolean(item)),
        ...(variableLayer ? [{ input: variableLayer, left: 0, top: 0 }] : []),
      ])
      .withMetadata({ density: canvas.dpi })
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toBuffer()

    if (manifest.settings.format === 'png') return printPng
    if (manifest.settings.format === 'jpg') {
      return sharp(printPng)
        .flatten({ background: '#ffffff' })
        .withMetadata({ density: canvas.dpi })
        .jpeg({ quality: manifest.settings.quality, chromaSubsampling: '4:4:4', mozjpeg: true })
        .toBuffer()
    }

    const pdf = await PDFDocument.create()
    const pageWidth = canvas.width / canvas.dpi * 72
    const pageHeight = canvas.height / canvas.dpi * 72
    const page = pdf.addPage([pageWidth, pageHeight])
    const embedded = await pdf.embedPng(printPng)
    page.drawImage(embedded, { x: 0, y: 0, width: pageWidth, height: pageHeight })
    pdf.setProducer('SelfBooth Export Engine')
    pdf.setTitle(manifest.settings.filename)
    return Buffer.from(await pdf.save({ useObjectStreams: true }))
  }

  private createVariableLayer(variables: TemplateVariable[], manifest: ExportManifest, canvas: PrintCanvas) {
    const content = variables.map((variable) => {
      if (variable.type === 'brandLogo') return ''
      const value = variable.type === 'customText' ? variable.value ?? '' : variable.type === 'qrCode' ? 'QR' : manifest.variables[variable.type]
      const x = canvas.bleed + variable.x * canvas.scaleX
      const y = canvas.bleed + variable.y * canvas.scaleY
      const width = variable.width * canvas.scaleX
      const anchor = variable.align === 'left' ? 'start' : variable.align === 'right' ? 'end' : 'middle'
      const textX = variable.align === 'left' ? x : variable.align === 'right' ? x + width : x + width / 2
      return `<text x="${textX}" y="${y + variable.height * canvas.scaleY * 0.72}" fill="${escapeXml(variable.color)}" font-family="Arial,sans-serif" font-size="${variable.fontSize * Math.min(canvas.scaleX, canvas.scaleY)}" font-weight="700" text-anchor="${anchor}">${escapeXml(value)}</text>`
    }).join('')
    if (!content) return null
    return Buffer.from(`<svg width="${canvas.width}" height="${canvas.height}" viewBox="0 0 ${canvas.width} ${canvas.height}">${content}</svg>`)
  }
}
