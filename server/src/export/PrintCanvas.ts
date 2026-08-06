import type { ExportTemplate, PrintSettings } from './types.js'

export class PrintCanvas {
  readonly dpi: number
  readonly trimWidth: number
  readonly trimHeight: number
  readonly bleed: number
  readonly width: number
  readonly height: number
  readonly scaleX: number
  readonly scaleY: number

  constructor(settings: PrintSettings, template: ExportTemplate) {
    const landscape = template.canvas.width > template.canvas.height
    const widthInches = landscape ? Math.max(settings.widthInches, settings.heightInches) : Math.min(settings.widthInches, settings.heightInches)
    const heightInches = landscape ? Math.min(settings.widthInches, settings.heightInches) : Math.max(settings.widthInches, settings.heightInches)

    this.dpi = settings.dpi
    this.trimWidth = Math.round(widthInches * this.dpi)
    this.trimHeight = Math.round(heightInches * this.dpi)
    this.bleed = Math.round(settings.bleedInches * this.dpi)
    this.width = Math.round((widthInches + settings.bleedInches * 2) * this.dpi)
    this.height = Math.round((heightInches + settings.bleedInches * 2) * this.dpi)
    this.scaleX = this.trimWidth / template.canvas.width
    this.scaleY = this.trimHeight / template.canvas.height
  }
}
