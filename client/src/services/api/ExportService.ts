import type { Export, ExportRequest } from '../../models/Export'

export interface ExportSource {
  fieldName: string
  photoId: string
  source: Blob
}

export interface CreateExportInput {
  request: ExportRequest
  sources: ExportSource[]
}

export interface ExportService {
  create(input: CreateExportInput): Promise<Export>
  getById(sessionId: string, exportId: string): Promise<Export>
}
