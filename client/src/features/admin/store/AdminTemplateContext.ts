import { createContext, useContext } from 'react'
import type { AdminTemplateRecord, AdminTemplateSummary, TemplateStatus } from '../types'

export interface AdminTemplateStoreValue {
  templates: AdminTemplateSummary[]
  loadDetail: (id: string) => Promise<AdminTemplateRecord>
  save: (record: AdminTemplateRecord) => Promise<AdminTemplateRecord>
  duplicate: (id: string) => Promise<string | null>
  setStatus: (id: string, status: TemplateStatus) => Promise<void>
  remove: (id: string) => Promise<void>
  reorder: (id: string, direction: -1 | 1) => Promise<void>
}

export const AdminTemplateContext = createContext<AdminTemplateStoreValue | null>(null)

export function useAdminTemplates() {
  const store = useContext(AdminTemplateContext)
  if (!store) throw new Error('useAdminTemplates must be used within AdminTemplateProvider')
  return store
}
