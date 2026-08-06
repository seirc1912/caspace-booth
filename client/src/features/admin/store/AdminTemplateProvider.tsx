import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { printTemplates } from '../../../data/templates'
import type { AdminTemplateRecord, TemplateStatus } from '../types'
import { AdminTemplateContext } from './AdminTemplateContext'

const storageKey = 'selfbooth.admin-template-studio.v1'
const uid = () => globalThis.crypto.randomUUID()

function initialTemplates(): AdminTemplateRecord[] {
  return printTemplates.map((template) => ({
    id: template.id,
    status: 'published',
    info: {
      category: 'Photo Booth', description: `${template.name} print template`, printSize: '4 × 6 in', dpi: 300,
      orientation: template.canvas.width === template.canvas.height ? 'square' : template.canvas.width > template.canvas.height ? 'landscape' : 'portrait',
    },
    template,
    coverUrl: template.thumbnailUrl,
    updatedAt: new Date().toISOString(),
  }))
}

function loadTemplates() {
  try {
    const value = localStorage.getItem(storageKey)
    return value ? JSON.parse(value) as AdminTemplateRecord[] : initialTemplates()
  } catch {
    return initialTemplates()
  }
}

export function AdminTemplateProvider({ children }: { children: ReactNode }) {
  const [templates, setTemplates] = useState(loadTemplates)
  useEffect(() => { localStorage.setItem(storageKey, JSON.stringify(templates)) }, [templates])

  const value = useMemo(() => ({
    templates,
    save: (record: AdminTemplateRecord) => setTemplates((current) => current.some((item) => item.id === record.id) ? current.map((item) => item.id === record.id ? record : item) : [...current, record]),
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
      return newId
    },
    setStatus: (id: string, status: TemplateStatus) => setTemplates((current) => current.map((item) => item.id === id ? { ...item, status, updatedAt: new Date().toISOString() } : item)),
    remove: (id: string) => setTemplates((current) => current.filter((item) => item.id !== id)),
  }), [templates])

  return <AdminTemplateContext.Provider value={value}>{children}</AdminTemplateContext.Provider>
}
