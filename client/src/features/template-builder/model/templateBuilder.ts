import type { TemplateDocument, TemplateElement, TemplateSlot, TemplateVariable } from '../../../types/selfBooth'

export interface TemplateBuilderState {
  document: TemplateDocument
  selectedSlotId: string | null
  snapToGrid: boolean
  gridSize: number
}

export type TemplateBuilderAction =
  | { type: 'select-slot'; slotId: string | null }
  | { type: 'add-slot'; slot?: Partial<TemplateSlot> }
  | { type: 'delete-slot'; slotId: string }
  | { type: 'duplicate-slot'; slotId: string }
  | { type: 'update-slot'; slotId: string; changes: Partial<Omit<TemplateSlot, 'id'>> }
  | { type: 'bring-forward'; slotId: string }
  | { type: 'send-backward'; slotId: string }
  | { type: 'toggle-snap'; enabled: boolean }
  | { type: 'set-grid-size'; size: number }
  | { type: 'add-variable'; variable: TemplateVariable }
  | { type: 'update-variable'; variableId: string; changes: Partial<Omit<TemplateVariable, 'id'>> }
  | { type: 'delete-variable'; variableId: string }
  | { type: 'add-element'; element: TemplateElement }
  | { type: 'update-element'; elementId: string; changes: Partial<Omit<TemplateElement, 'id'>> }
  | { type: 'delete-element'; elementId: string }
  | { type: 'reorder-element'; elementId: string; zIndex: number }
  | { type: 'replace-document'; document: TemplateDocument }

const createId = () => globalThis.crypto?.randomUUID?.() ?? `slot-${Date.now()}-${Math.random().toString(36).slice(2)}`
const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value))
const snap = (value: number, size: number) => Math.round(value / size) * size

export function createTemplateDocument(id: string, name: string, width = 1200, height = 1800): TemplateDocument {
  return { schemaVersion: 1, id, name, canvas: { width, height }, assets: { background: 'background.png', thumbnail: 'thumbnail.png' }, backgroundColor: '#ffffff', slots: [], variables: [], elements: [] }
}

export function createTemplateBuilderState(document: TemplateDocument): TemplateBuilderState {
  return { document, selectedSlotId: null, snapToGrid: true, gridSize: 20 }
}

function normalizeSlot(state: TemplateBuilderState, slot: TemplateSlot): TemplateSlot {
  const x = state.snapToGrid ? snap(slot.x, state.gridSize) : slot.x
  const y = state.snapToGrid ? snap(slot.y, state.gridSize) : slot.y
  const width = state.snapToGrid ? snap(slot.width, state.gridSize) : slot.width
  const height = slot.lockAspectRatio ? width / (slot.width / slot.height) : state.snapToGrid ? snap(slot.height, state.gridSize) : slot.height
  return { ...slot, x: clamp(x, 0, state.document.canvas.width - 20), y: clamp(y, 0, state.document.canvas.height - 20), width: clamp(width, 20, state.document.canvas.width - x), height: clamp(height, 20, state.document.canvas.height - y), borderRadius: Math.max(0, slot.borderRadius) }
}

export function templateBuilderReducer(state: TemplateBuilderState, action: TemplateBuilderAction): TemplateBuilderState {
  switch (action.type) {
    case 'select-slot': return { ...state, selectedSlotId: action.slotId }
    case 'toggle-snap': return { ...state, snapToGrid: action.enabled }
    case 'set-grid-size': return { ...state, gridSize: Math.max(1, action.size) }
    case 'replace-document': return createTemplateBuilderState(action.document)
    case 'add-variable': return { ...state, document: { ...state.document, variables: [...state.document.variables, action.variable] } }
    case 'update-variable': return { ...state, document: { ...state.document, variables: state.document.variables.map((variable) => variable.id === action.variableId ? { ...variable, ...action.changes } : variable) } }
    case 'delete-variable': return { ...state, document: { ...state.document, variables: state.document.variables.filter((variable) => variable.id !== action.variableId) } }
    case 'add-element': return { ...state, document: { ...state.document, elements: [...state.document.elements, action.element] } }
    case 'update-element': return { ...state, document: { ...state.document, elements: state.document.elements.map((element) => element.id === action.elementId ? { ...element, ...action.changes } : element) } }
    case 'delete-element': return { ...state, document: { ...state.document, elements: state.document.elements.filter((element) => element.id !== action.elementId) } }
    case 'reorder-element': return { ...state, document: { ...state.document, elements: state.document.elements.map((element) => element.id === action.elementId ? { ...element, zIndex: action.zIndex } : element) } }
    case 'add-slot': {
      const highestZ = Math.max(0, ...state.document.slots.map((slot) => slot.zIndex))
      const slot = normalizeSlot(state, { id: createId(), x: 100, y: 100, width: 400, height: 500, rotation: 0, borderRadius: 0, lockAspectRatio: true, zIndex: highestZ + 1, ...action.slot })
      return { ...state, document: { ...state.document, slots: [...state.document.slots, slot] }, selectedSlotId: slot.id }
    }
    case 'delete-slot': return { ...state, document: { ...state.document, slots: state.document.slots.filter((slot) => slot.id !== action.slotId) }, selectedSlotId: state.selectedSlotId === action.slotId ? null : state.selectedSlotId }
    case 'duplicate-slot': {
      const source = state.document.slots.find((slot) => slot.id === action.slotId)
      if (!source) return state
      const copy = normalizeSlot(state, { ...source, id: createId(), x: source.x + state.gridSize, y: source.y + state.gridSize, zIndex: source.zIndex + 1 })
      return { ...state, document: { ...state.document, slots: [...state.document.slots, copy] }, selectedSlotId: copy.id }
    }
    case 'update-slot': return { ...state, document: { ...state.document, slots: state.document.slots.map((slot) => slot.id === action.slotId ? normalizeSlot(state, { ...slot, ...action.changes }) : slot) } }
    case 'bring-forward': return { ...state, document: { ...state.document, slots: state.document.slots.map((slot) => slot.id === action.slotId ? { ...slot, zIndex: slot.zIndex + 1 } : slot) } }
    case 'send-backward': return { ...state, document: { ...state.document, slots: state.document.slots.map((slot) => slot.id === action.slotId ? { ...slot, zIndex: Math.max(0, slot.zIndex - 1) } : slot) } }
  }
}

export function serializeTemplate(document: TemplateDocument) {
  return JSON.stringify(document, null, 2)
}

export interface TemplatePackage {
  templateJson: string
  background: File
  thumbnail: File
}

export function createTemplatePackage(document: TemplateDocument, background: File, thumbnail: File): TemplatePackage {
  if (background.type !== 'image/png' || thumbnail.type !== 'image/png') {
    throw new Error('Template background and thumbnail must be PNG files')
  }
  return { templateJson: serializeTemplate(document), background, thumbnail }
}

export function createTemplateAssetPreview(file: File) {
  if (!file.type.startsWith('image/')) throw new Error('Template asset must be an image')
  return URL.createObjectURL(file)
}
