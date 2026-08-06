import type { TemplateDocument } from '../../../types/selfBooth'

type LayerKind = 'slot' | 'element' | 'variable'

interface LayerPosition { id: string; kind: LayerKind; zIndex: number }

function positions(document: TemplateDocument): LayerPosition[] {
  return [
    ...document.slots.map((item) => ({ id: item.id, kind: 'slot' as const, zIndex: item.zIndex })),
    ...document.elements.map((item) => ({ id: item.id, kind: 'element' as const, zIndex: item.zIndex })),
    ...document.variables.map((item) => ({ id: item.id, kind: 'variable' as const, zIndex: item.zIndex })),
  ].sort((left, right) => left.zIndex - right.zIndex)
}

export function reorderLayer(document: TemplateDocument, sourceId: string, targetId: string): TemplateDocument {
  const ordered = positions(document)
  const sourceIndex = ordered.findIndex((item) => item.id === sourceId)
  const targetIndex = ordered.findIndex((item) => item.id === targetId)
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return document
  const [source] = ordered.splice(sourceIndex, 1)
  if (!source) return document
  ordered.splice(targetIndex, 0, source)
  const zById = new Map(ordered.map((item, index) => [item.id, index + 1]))
  return {
    ...document,
    slots: document.slots.map((item) => ({ ...item, zIndex: zById.get(item.id) ?? item.zIndex })),
    elements: document.elements.map((item) => ({ ...item, zIndex: zById.get(item.id) ?? item.zIndex })),
    variables: document.variables.map((item) => ({ ...item, zIndex: zById.get(item.id) ?? item.zIndex })),
  }
}
