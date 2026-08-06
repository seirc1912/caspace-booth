import type { Template, TemplateSummary, TemplateStatus } from '../../models/Template'

export interface ListTemplatesQuery {
  category?: string
  status?: TemplateStatus
  cursor?: string
  limit?: number
}

export interface TemplatePage {
  items: TemplateSummary[]
  nextCursor: string | null
}

export interface TemplateService {
  list(query?: ListTemplatesQuery): Promise<TemplatePage>
  getById(templateId: string): Promise<Template>
  create(template: Template): Promise<Template>
  update(template: Template): Promise<Template>
  duplicate(templateId: string): Promise<Template>
  setStatus(templateId: string, status: TemplateStatus): Promise<Template>
  delete(templateId: string): Promise<void>
}
