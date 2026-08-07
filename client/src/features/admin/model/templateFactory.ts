import type { PrintTemplate, TemplateDocument } from '../../../types/selfBooth'
import { createTemplateDocument } from '../../template-builder/model/templateBuilder'
import type { AdminTemplateRecord, TemplateOrientation } from '../types'

export type CanvasPreset = 'a4-portrait' | 'a4-landscape' | 'custom'
export const canvasPresets: Record<Exclude<CanvasPreset, 'custom'>, { width: number; height: number; label: string; orientation: TemplateOrientation }> = {
  'a4-portrait': { width: 2480, height: 3508, label: 'A4 Portrait', orientation: 'portrait' },
  'a4-landscape': { width: 3508, height: 2480, label: 'A4 Landscape', orientation: 'landscape' },
}

export function asPrintTemplate(document: TemplateDocument, source?: PrintTemplate): PrintTemplate {
  return { ...document, layers: [{ id: 'background', type: 'background', zIndex: 0 }, ...document.slots.map((slot) => ({ id: slot.id, type: 'photoSlot' as const, zIndex: slot.zIndex })), ...document.elements.map((element) => ({ id: element.id, type: element.type, zIndex: element.zIndex })), ...document.variables.map((variable) => ({ id: variable.id, type: 'dynamicVariable' as const, zIndex: variable.zIndex }))], slotCount: document.slots.length, backgroundUrl: source?.backgroundUrl ?? null, thumbnailUrl: source?.thumbnailUrl ?? null }
}

export function createAdminTemplateRecord(name = 'Untitled Template', preset: CanvasPreset = 'a4-portrait', custom = { width: 2480, height: 3508 }): AdminTemplateRecord {
  const id = crypto.randomUUID()
  const dimensions = preset === 'custom' ? { ...custom, label: 'Custom', orientation: custom.width === custom.height ? 'square' as const : custom.width > custom.height ? 'landscape' as const : 'portrait' as const } : canvasPresets[preset]
  return { id, roomId: 'room-default', status: 'draft', info: { category: 'Custom', description: '', printSize: dimensions.label, dpi: 300, orientation: dimensions.orientation }, template: asPrintTemplate(createTemplateDocument(id, name, dimensions.width, dimensions.height)), coverUrl: null, updatedAt: new Date().toISOString() }
}
