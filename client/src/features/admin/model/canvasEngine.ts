import type { TemplateElement, TemplateGuideSettings } from '../../../types/selfBooth'

const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value))

export function normalizeElementChange(
  element: TemplateElement,
  changes: Partial<TemplateElement>,
  canvas: { width: number; height: number },
  guides: TemplateGuideSettings,
) {
  const next = { ...element, ...changes }
  const snap = (value: number) => guides.snapToGrid ? Math.round(value / guides.gridSize) * guides.gridSize : value
  const x = clamp(snap(next.x), 0, Math.max(0, canvas.width - 20))
  const y = clamp(snap(next.y), 0, Math.max(0, canvas.height - 20))
  return {
    ...changes,
    x,
    y,
    width: clamp(snap(next.width), 20, canvas.width - x),
    height: clamp(snap(next.height), 20, canvas.height - y),
    opacity: clamp(next.opacity, 0, 1),
  }
}
