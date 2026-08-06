import type { BrandingConfig } from '../../types/branding'
import type { ExportResult, PrintSettings } from '../../types/export'
import type { FilledSlot, PrintTemplate } from '../../types/selfBooth'
import type { CustomerSession } from '../../types/session'
import { printSizes } from '../../data/printSizes'

interface CreateExportInput {
  branding: BrandingConfig
  settings: PrintSettings
  session: CustomerSession
  slots: Array<FilledSlot | null>
  template: PrintTemplate
}

export class ExportService {
  private readonly apiUrl: string

  constructor(apiUrl = import.meta.env.VITE_API_URL ?? '') {
    this.apiUrl = apiUrl
  }

  async create({ branding, settings, session, slots, template }: CreateExportInput): Promise<ExportResult> {
    const size = printSizes.find((item) => item.id === settings.sizeId) ?? printSizes[1]
    const widthInches = settings.sizeId === 'custom' ? settings.customWidth : size.widthInches
    const heightInches = settings.sizeId === 'custom' ? settings.customHeight : size.heightInches
    const form = new FormData()
    const assignments = []

    for (let index = 0; index < slots.length; index += 1) {
      const slot = slots[index]
      if (!slot) throw new Error('Every photo slot must be filled before export')
      const response = await fetch(slot.photo.src)
      if (!response.ok) throw new Error(`Unable to load original image ${index + 1}`)
      const source = await response.blob()
      const fieldName = `image-${index}`
      form.append(fieldName, source, `${slot.photo.id}.${source.type.includes('png') ? 'png' : 'jpg'}`)
      assignments.push({ fieldName, transform: slot.transform })
    }

    const now = new Date()
    form.append('manifest', JSON.stringify({
      sessionId: session.sessionId,
      templateId: template.id,
      settings: {
        format: settings.format,
        widthInches,
        heightInches,
        bleedInches: settings.bleedInches,
        dpi: 300,
        quality: settings.format === 'png' ? 100 : settings.quality,
        colorProfile: settings.colorProfile,
        filename: settings.filename,
      },
      slots: assignments,
      variables: {
        brandName: branding.brandName,
        website: branding.websiteLabel,
        date: now.toLocaleDateString(),
        time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    }))

    const response = await fetch(`${this.apiUrl}/api/exports`, { method: 'POST', body: form, headers: { 'X-Session-Token': session.token } })
    const result = await response.json() as ExportResult & { error?: string }
    if (!response.ok) throw new Error(result.error ?? 'Export failed')
    return result
  }
}
