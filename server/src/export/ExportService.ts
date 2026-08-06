import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { RenderEngine } from './RenderEngine.js'
import type { ExportManifest, ExportTemplate } from './types.js'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const templatesRoot = resolve(projectRoot, 'templates')
const exportsRoot = resolve(projectRoot, 'exports')

const safeFilename = (value: string) => value.trim().replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'selfbooth-print'

export class ExportService {
  constructor(private readonly renderEngine = new RenderEngine()) {}

  async create(manifest: ExportManifest, images: Map<string, Buffer>) {
    this.validateManifest(manifest)
    const templateDirectory = resolve(templatesRoot, manifest.templateId)
    if (!templateDirectory.startsWith(`${templatesRoot}${sep}`)) throw new Error('Invalid template path')

    const template = JSON.parse(await readFile(resolve(templateDirectory, 'template.json'), 'utf8')) as ExportTemplate
    if (template.id !== manifest.templateId || template.schemaVersion !== 1) throw new Error('Invalid template document')
    if (template.assets.background !== 'background.png') throw new Error('Invalid template background')
    if (!Array.isArray(template.slots) || template.slots.length < 1 || template.slots.length > 20 || template.slots.length !== manifest.slots.length) throw new Error('Invalid template slots')
    if (template.slots.some((slot) => slot.x < 0 || slot.y < 0 || slot.width <= 0 || slot.height <= 0 || slot.x + slot.width > template.canvas.width || slot.y + slot.height > template.canvas.height)) throw new Error('Template slot exceeds canvas bounds')

    const output = await this.renderEngine.render(manifest, template, templateDirectory, images)
    const sessionDirectory = resolve(exportsRoot, manifest.sessionId)
    if (!sessionDirectory.startsWith(`${exportsRoot}${sep}`)) throw new Error('Invalid session path')
    await mkdir(sessionDirectory, { recursive: true })
    const filename = `${safeFilename(manifest.settings.filename)}-${Date.now()}.${manifest.settings.format}`
    const outputPath = resolve(sessionDirectory, filename)
    await writeFile(outputPath, output, { flag: 'wx' })
    return { filename, relativePath: `exports/${manifest.sessionId}/${filename}`, bytes: output.length }
  }

  private validateManifest(manifest: ExportManifest) {
    const settings = manifest.settings
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(manifest.sessionId)) throw new Error('Invalid session ID')
    if (!/^[a-zA-Z0-9_-]+$/.test(manifest.templateId)) throw new Error('Invalid template ID')
    if (!['png', 'jpg', 'pdf'].includes(settings.format)) throw new Error('Unsupported export format')
    if (settings.dpi !== 300 || settings.widthInches <= 0 || settings.heightInches <= 0 || settings.widthInches > 24 || settings.heightInches > 24) throw new Error('Invalid print dimensions')
    if (settings.bleedInches < 0 || settings.bleedInches > 1 || settings.quality < 1 || settings.quality > 100 || settings.colorProfile !== 'srgb') throw new Error('Invalid print settings')
  }
}
