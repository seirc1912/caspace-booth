import type { PrintTemplate, TemplateDocument, TemplateSlot, TemplateVariable } from '../types/selfBooth'

const definitionModules = import.meta.glob('../../../templates/*/template.json', {
  eager: true,
  import: 'default',
}) as Record<string, unknown>

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

function parseSlot(value: unknown): TemplateSlot {
  if (!value || typeof value !== 'object') throw new Error('Invalid template slot')
  const slot = value as Record<string, unknown>
  if (
    typeof slot.id !== 'string'
    || !isNumber(slot.x) || !isNumber(slot.y)
    || !isNumber(slot.width) || !isNumber(slot.height)
    || !isNumber(slot.rotation) || !isNumber(slot.borderRadius)
    || typeof slot.lockAspectRatio !== 'boolean'
    || !isNumber(slot.zIndex)
  ) throw new Error(`Invalid template slot: ${String(slot.id ?? 'unknown')}`)
  return slot as unknown as TemplateSlot
}

function parseVariable(value: unknown): TemplateVariable {
  if (!value || typeof value !== 'object') throw new Error('Invalid template variable')
  const variable = value as Record<string, unknown>
  const validTypes = ['brandLogo', 'brandName', 'website', 'date', 'time', 'qrCode', 'customText']
  const validAlignments = ['left', 'center', 'right']
  if (
    typeof variable.id !== 'string' || typeof variable.type !== 'string' || !validTypes.includes(variable.type)
    || !isNumber(variable.x) || !isNumber(variable.y) || !isNumber(variable.width) || !isNumber(variable.height)
    || !isNumber(variable.fontSize) || typeof variable.color !== 'string'
    || typeof variable.align !== 'string' || !validAlignments.includes(variable.align)
    || !isNumber(variable.zIndex)
  ) throw new Error(`Invalid template variable: ${String(variable.id ?? 'unknown')}`)
  return variable as unknown as TemplateVariable
}

function parseTemplate(path: string, value: unknown): PrintTemplate {
  if (!value || typeof value !== 'object') throw new Error(`Invalid print template: ${path}`)
  const candidate = value as Record<string, unknown>
  const canvas = candidate.canvas as Record<string, unknown> | undefined
  const assets = candidate.assets as Record<string, unknown> | undefined
  if (
    candidate.schemaVersion !== 1 || typeof candidate.id !== 'string' || typeof candidate.name !== 'string'
    || !canvas || !isNumber(canvas.width) || !isNumber(canvas.height)
    || !assets || typeof assets.background !== 'string' || typeof assets.thumbnail !== 'string'
    || typeof candidate.backgroundColor !== 'string' || !Array.isArray(candidate.slots) || !Array.isArray(candidate.variables)
  ) throw new Error(`Invalid print template: ${path}`)

  const document: TemplateDocument = {
    schemaVersion: 1,
    id: candidate.id,
    name: candidate.name,
    canvas: { width: canvas.width, height: canvas.height },
    assets: { background: assets.background, thumbnail: assets.thumbnail },
    backgroundColor: candidate.backgroundColor,
    slots: candidate.slots.map(parseSlot),
    variables: candidate.variables.map(parseVariable),
    elements: [],
  }
  return {
    ...document,
    slotCount: document.slots.length,
    // Built-in assets are served from public paths. Do not use Vite's /@fs/
    // development URLs here: template records are shared through Supabase and
    // must remain valid in a production deployment.
    backgroundUrl: `/templates/${document.id}/${document.assets.background}`,
    thumbnailUrl: `/templates/${document.id}/${document.assets.thumbnail}`,
  }
}

export const printTemplates = Object.entries(definitionModules)
  .map(([path, definition]) => parseTemplate(path, definition))
  .sort((left, right) => left.name.localeCompare(right.name))
