import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { AdminTemplateRecord, AdminTemplateSummary, TemplateStatus } from '../types'
import { AdminTemplateContext } from './AdminTemplateContext'
import { deleteAdminTemplate, loadAdminTemplateDetail, loadAdminTemplateSummaries, saveAdminTemplate } from '../../../services/catalog/SupabaseCatalogService'
import { migrateLegacyCatalogOnce } from '../../../services/catalog/LegacyCatalogMigration'

const uid = () => globalThis.crypto.randomUUID()

export function AdminTemplateProvider({ children }: { children: ReactNode }) {
  const [templates, setTemplates] = useState<AdminTemplateSummary[]>([])
  const details = useRef(new Map<string, AdminTemplateRecord>())

  const refresh = useCallback(async () => setTemplates(await loadAdminTemplateSummaries()), [])

  useEffect(() => {
    let active = true
    void migrateLegacyCatalogOnce().then((catalog) => { if (active) setTemplates(catalog.templates) }).catch(console.error)
    return () => { active = false }
  }, [])

  const value = useMemo(() => ({
    templates,
    loadDetail: async (id: string) => {
      const cached = details.current.get(id)
      if (cached) return structuredClone(cached)
      const detail = await loadAdminTemplateDetail(id)
      details.current.set(id, detail)
      return structuredClone(detail)
    },
    save: async (record: AdminTemplateRecord) => {
      const index = templates.findIndex((item) => item.id === record.id)
      const saved = await saveAdminTemplate(record, index >= 0 ? templates[index]!.displayOrder : templates.length)
      details.current.set(saved.id, saved)
      await refresh()
      return saved
    },
    duplicate: async (id: string) => {
      const source = await (details.current.get(id) ? Promise.resolve(details.current.get(id)!) : loadAdminTemplateDetail(id))
      if (!source) return null
      const newId = uid()
      const copy = structuredClone(source)
      copy.id = newId
      copy.status = 'draft'
      copy.template.id = newId
      copy.template.name = `${source.template.name} Copy`
      copy.updatedAt = new Date().toISOString()
      const saved = await saveAdminTemplate(copy, templates.length)
      details.current.set(saved.id, saved)
      await refresh()
      return newId
    },
    setStatus: async (id: string, status: TemplateStatus) => {
      const index = templates.findIndex((item) => item.id === id)
      if (index < 0) return
      const template = await (details.current.get(id) ? Promise.resolve(details.current.get(id)!) : loadAdminTemplateDetail(id))
      const saved = await saveAdminTemplate({ ...template, status, updatedAt: new Date().toISOString() }, templates[index]!.displayOrder)
      details.current.set(id, saved)
      await refresh()
    },
    remove: async (id: string) => {
      await deleteAdminTemplate(id)
      details.current.delete(id)
      setTemplates((current) => current.filter((item) => item.id !== id))
    },
    reorder: async (id: string, direction: -1 | 1) => {
      const index = templates.findIndex((template) => template.id === id)
      const swap = index + direction
      if (index < 0 || swap < 0 || swap >= templates.length) return
      const reordered = [...templates]
      ;[reordered[index], reordered[swap]] = [reordered[swap]!, reordered[index]!]
      for (const [displayOrder, summary] of reordered.entries()) {
        const detail = await (details.current.get(summary.id) ? Promise.resolve(details.current.get(summary.id)!) : loadAdminTemplateDetail(summary.id))
        await saveAdminTemplate(detail, displayOrder)
      }
      await refresh()
    },
  }), [refresh, templates])

  return <AdminTemplateContext.Provider value={value}>{children}</AdminTemplateContext.Provider>
}
