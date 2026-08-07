import type { TemplateSlot } from '../../../types/selfBooth'

export type LayoutPresetId = '2-photos' | '3-photos' | '4-photos' | '6-photos' | '9-photos' | 'film-strip' | 'passport' | 'wedding' | 'magazine' | 'polaroid'

export interface LayoutPreset {
  id: LayoutPresetId
  name: string
  createSlots: (width: number, height: number) => TemplateSlot[]
}

const createId = () => globalThis.crypto.randomUUID()

function gridSlots(count: number, columns: number, width: number, height: number, margin = 0.06, gap = 0.025) {
  const rows = Math.ceil(count / columns)
  const slotWidth = width * (1 - margin * 2 - gap * (columns - 1)) / columns
  const slotHeight = height * (1 - margin * 2 - gap * (rows - 1)) / rows
  return Array.from({ length: count }, (_, index): TemplateSlot => ({
    id: createId(), name: `Photo ${index + 1}`,
    x: width * margin + index % columns * (slotWidth + width * gap),
    y: height * margin + Math.floor(index / columns) * (slotHeight + height * gap),
    width: slotWidth, height: slotHeight, rotation: 0, borderRadius: 0,
    lockAspectRatio: true, opacity: 1, visible: true, locked: false,
    mask: 'rectangle', cropMode: 'cover', zIndex: index + 1, photoIndex: index, aspectRatio: 'free', borderWidth: 0, borderColor: '#000000', shadow: { color: '#000000', blur: 0, offsetX: 0, offsetY: 0 },
  }))
}

const grid = (count: number, columns: number) => (width: number, height: number) => gridSlots(count, columns, width, height)

export const layoutPresets: readonly LayoutPreset[] = [
  { id: '2-photos', name: '2 Photos', createSlots: grid(2, 1) },
  { id: '3-photos', name: '3 Photos', createSlots: grid(3, 1) },
  { id: '4-photos', name: '4 Photos', createSlots: grid(4, 2) },
  { id: '6-photos', name: '6 Photos', createSlots: grid(6, 2) },
  { id: '9-photos', name: '9 Photos', createSlots: grid(9, 3) },
  { id: 'film-strip', name: 'Film Strip', createSlots: (width, height) => gridSlots(4, 1, width, height, 0.09, 0.018) },
  { id: 'passport', name: 'Passport', createSlots: (width, height) => gridSlots(8, 2, width, height, 0.08, 0.02) },
  { id: 'wedding', name: 'Wedding', createSlots: (width, height) => gridSlots(4, 2, width, height, 0.075, 0.035).map((slot) => ({ ...slot, borderRadius: Math.min(width, height) * 0.02 })) },
  { id: 'magazine', name: 'Magazine', createSlots: (width, height) => [
    ...gridSlots(1, 1, width, height * 0.62, 0.06, 0),
    ...gridSlots(2, 2, width, height * 0.32, 0.06, 0.025).map((slot, index) => ({ ...slot, id: createId(), name: `Photo ${index + 2}`, y: slot.y + height * 0.64, zIndex: index + 2 })),
  ] },
  { id: 'polaroid', name: 'Polaroid', createSlots: (width, height) => gridSlots(1, 1, width, height * 0.78, 0.09, 0).map((slot) => ({ ...slot, borderRadius: Math.min(width, height) * 0.008 })) },
]
