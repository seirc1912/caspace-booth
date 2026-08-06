import { createContext, useContext } from 'react'
import type { AdminTemplateRecord, TemplateStatus } from '../types'

export interface AdminTemplateStoreValue {
  templates: AdminTemplateRecord[]
  save: (record: AdminTemplateRecord) => void
  duplicate: (id: string) => string | null
  setStatus: (id: string, status: TemplateStatus) => void
  remove: (id: string) => void
}

export const AdminTemplateContext = createContext<AdminTemplateStoreValue | null>(null)

export function useAdminTemplates() {
  const store = useContext(AdminTemplateContext)
  if (!store) throw new Error('useAdminTemplates must be used within AdminTemplateProvider')
  return store
}
