import type { PrintTemplate } from '../../types/selfBooth'
import type { Room } from '../../models/Room'

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
  roomId: string
  status: TemplateStatus
  info: AdminTemplateInfo
  template: PrintTemplate
  coverUrl: string | null
  updatedAt: string
}

export interface AdminTemplateSummary {
  id: string
  roomId: string
  name: string
  status: TemplateStatus
  thumbnailUrl: string | null
  category: string
  slotCount: number
  displayOrder: number
  updatedAt: string
}

export type AdminRoom = Room
