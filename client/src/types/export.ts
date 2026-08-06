export type ExportFormat = 'png' | 'jpg' | 'pdf'
export type PrintSizeId = '2x6' | '4x6' | '5x7' | '6x8' | 'custom'

export interface PrintSize {
  id: PrintSizeId
  label: string
  widthInches: number
  heightInches: number
}

export interface PrintSettings {
  format: ExportFormat
  sizeId: PrintSizeId
  customWidth: number
  customHeight: number
  bleedInches: number
  quality: number
  colorProfile: 'srgb'
  filename: string
}

export interface ExportResult {
  filename: string
  relativePath: string
  bytes: number
}
