import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { AdminTemplateRecord, TemplateStatus } from '../types'
import { AdminTemplateContext } from './AdminTemplateContext'
import { deleteAdminTemplate, loadAdminTemplates, saveAdminTemplate } from '../../../services/catalog/SupabaseCatalogService'
import { migrateLegacyCatalogOnce } from '../../../services/catalog/LegacyCatalogMigration'

const uid = () => globalThis.crypto.randomUUID()

export function AdminTemplateProvider({ children }: { children: ReactNode }) {
  const [templates, setTemplates] = useState<AdminTemplateRecord[]>([])
  const writeQueue = useRef(Promise.resolve())

  const refresh = useCallback(async () => setTemplates(await loadAdminTemplates()), [])
  const enqueue = useCallback((operation: () => Promise<unknown>) => {
    writeQueue.current = writeQueue.current.then(operation).then(() => undefined).catch(async (error) => {
      console.error(error)
      await refresh()
    })
  }, [refresh])

  useEffect(() => {
    let active = true
    void migrateLegacyCatalogOnce().then(loadAdminTemplates).then((catalog) => { if (active) setTemplates(catalog) }).catch(console.error)
    return () => { active = false }
  }, [])

  const value = useMemo(() => ({
    templates,
    save: (record: AdminTemplateRecord) => {
      const index = templates.findIndex((item) => item.id === record.id)
      setTemplates((current) => index >= 0 ? current.map((item) => item.id === record.id ? record : item) : [...current, record])
      enqueue(() => saveAdminTemplate(record, index >= 0 ? index : templates.length))
    },
    duplicate: (id: string) => {
      const source = templates.find((item) => item.id === id)
      if (!source) return null
      const newId = uid()
      const copy = structuredClone(source)
      copy.id = newId
      copy.status = 'draft'
      copy.template.id = newId
      copy.template.name = `${source.template.name} Copy`
      copy.updatedAt = new Date().toISOString()
      setTemplates((current) => [...current, copy])
      enqueue(() => saveAdminTemplate(copy, templates.length))
      return newId
    },
    setStatus: (id: string, status: TemplateStatus) => {
      const index = templates.findIndex((item) => item.id === id)
      const template = templates[index]
      if (!template) return
      const updated = { ...template, status, updatedAt: new Date().toISOString() }
      setTemplates((current) => current.map((item) => item.id === id ? updated : item))
      enqueue(() => saveAdminTemplate(updated, index))
    },
    remove: (id: string) => {
      setTemplates((current) => current.filter((item) => item.id !== id))
      enqueue(() => deleteAdminTemplate(id))
    },
    reorder: (id: string, direction: -1 | 1) => {
      const index = templates.findIndex((template) => template.id === id)
      const swap = index + direction
      if (index < 0 || swap < 0 || swap >= templates.length) return
      const reordered = [...templates]
      ;[reordered[index], reordered[swap]] = [reordered[swap]!, reordered[index]!]
      setTemplates(reordered)
      enqueue(async () => { for (const [displayOrder, template] of reordered.entries()) await saveAdminTemplate(template, displayOrder) })
    },
  }), [enqueue, templates])

  return <AdminTemplateContext.Provider value={value}>{children}</AdminTemplateContext.Provider>
}
