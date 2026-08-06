export type ExportFormat = 'png' | 'jpg' | 'pdf'

export interface PrintSettings {
  format: ExportFormat
  widthInches: number
  heightInches: number
  bleedInches: number
  dpi: 300
  quality: number
  colorProfile: 'srgb'
  filename: string
}

export interface ExportTransform {
  zoom: number
  rotation: number
  x: number
  y: number
}

export interface ExportSlot {
  fieldName: string
  transform: ExportTransform
}

export interface ExportManifest {
  sessionId: string
  templateId: string
  settings: PrintSettings
  slots: ExportSlot[]
  variables: {
    brandName: string
    website: string
    date: string
    time: string
  }
}

export interface TemplateSlot {
  id: string
  x: number
  y: number
  width: number
  height: number
  rotation: number
  borderRadius: number
  zIndex: number
}

export interface TemplateVariable {
  id: string
  type: 'brandLogo' | 'brandName' | 'website' | 'date' | 'time' | 'qrCode' | 'customText'
  value?: string
  x: number
  y: number
  width: number
  height: number
  fontSize: number
  color: string
  align: 'left' | 'center' | 'right'
  zIndex: number
}

export interface ExportTemplate {
  schemaVersion: 1
  id: string
  canvas: { width: number; height: number }
  assets: { background: string }
  backgroundColor: string
  slots: TemplateSlot[]
  variables: TemplateVariable[]
}
