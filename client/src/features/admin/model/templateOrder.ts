import type { AdminTemplateSummary } from '../types'

export function parseTemplatePosition(value: string, roomSize: number) {
  const trimmed = value.trim()
  if (!/^\d+$/.test(trimmed)) return null
  const position = Number(trimmed)
  if (!Number.isSafeInteger(position) || position < 1 || roomSize < 1) return null
  return Math.min(position, roomSize)
}

export function reorderTemplatesInRoom(templates: AdminTemplateSummary[], id: string, requestedPosition: number) {
  const target = templates.find((template) => template.id === id)
  if (!target) return templates
  const roomTemplates = templates
    .filter((template) => template.roomId === target.roomId)
    .sort((left, right) => left.displayOrder - right.displayOrder || left.id.localeCompare(right.id))
  const currentIndex = roomTemplates.findIndex((template) => template.id === id)
  const nextIndex = Math.max(0, Math.min(requestedPosition - 1, roomTemplates.length - 1))
  if (currentIndex === nextIndex) return templates
  const reordered = [...roomTemplates]
  const [moved] = reordered.splice(currentIndex, 1)
  reordered.splice(nextIndex, 0, moved!)
  const positions = new Map(reordered.map((template, index) => [template.id, index + 1]))
  return templates.map((template) => positions.has(template.id) ? { ...template, displayOrder: positions.get(template.id)! } : template)
}
