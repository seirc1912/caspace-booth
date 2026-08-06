import type { ExportFormat, ExportResult, PrintSettings } from '../types/export'

export type ExportStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled'

export interface Export {
  id: string
  sessionId: string
  templateId: string
  format: ExportFormat
  status: ExportStatus
  filename: string
  outputUrl: string | null
  bytes: number | null
  createdAt: string
  completedAt: string | null
  error: string | null
}

export interface ExportRequest {
  sessionId: string
  templateId: string
  settings: PrintSettings
}

export type CompletedExport = ExportResult
