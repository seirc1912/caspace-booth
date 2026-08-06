import type { PrintTemplate, TemplateDocument } from '../types/selfBooth'

export type TemplateStatus = 'draft' | 'published' | 'archived'
export type TemplateOrientation = 'portrait' | 'landscape' | 'square'

export interface Template {
  id: string
  document: TemplateDocument
  category: string
  description: string
  printSize: string
  dpi: number
  orientation: TemplateOrientation
  status: TemplateStatus
  coverUrl: string | null
  createdAt: string
  updatedAt: string
  publishedAt: string | null
}

export interface TemplateSummary {
  id: string
  name: string
  category: string
  slotCount: number
  thumbnailUrl: string | null
  status: TemplateStatus
  updatedAt: string
}

export type RuntimeTemplate = PrintTemplate
