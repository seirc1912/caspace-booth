import type { PrintTemplate } from '../../types/selfBooth'

export type TemplateStatus = 'draft' | 'published' | 'archived'
export type TemplateOrientation = 'portrait' | 'landscape' | 'square'

export interface AdminTemplateInfo {
  category: string
  description: string
  printSize: string
  dpi: number
  orientation: TemplateOrientation
}

export interface AdminTemplateRecord {
  id: string
  status: TemplateStatus
  info: AdminTemplateInfo
  template: PrintTemplate
  coverUrl: string | null
  updatedAt: string
}
