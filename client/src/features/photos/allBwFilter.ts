import type { FilledSlot, PhotoAsset } from '../../types/selfBooth'
import { createInitialPhotoSlot } from './initialPhotoSlot'
import type { PhotoFilter } from './photoFilter'

export interface SlotFilterSnapshot {
  photoId: string
  filter: PhotoFilter
}

export type AllBwFilterSnapshot = Record<string, Array<SlotFilterSnapshot | null>>
export type FrameSlots = Record<string, Array<FilledSlot | null>>

export function captureAllBwFilterSnapshot(frameSlots: FrameSlots): AllBwFilterSnapshot {
  return Object.fromEntries(Object.entries(frameSlots).map(([templateId, slots]) => [templateId, slots.map((slot) => slot ? {
    photoId: slot.photo.id,
    filter: slot.filter === 'grayscale' ? 'grayscale' : 'none',
  } : null)]))
}

export function applyAllBwFilter(frameSlots: FrameSlots): FrameSlots {
  return Object.fromEntries(Object.entries(frameSlots).map(([templateId, slots]) => [templateId, slots.map((slot) => slot ? { ...slot, filter: 'grayscale' as const } : null)]))
}

export function restoreAllBwFilter(frameSlots: FrameSlots, snapshot: AllBwFilterSnapshot): FrameSlots {
  return Object.fromEntries(Object.entries(frameSlots).map(([templateId, slots]) => [templateId, slots.map((slot, index) => {
    if (!slot) return null
    const previous = snapshot[templateId]?.[index]
    return { ...slot, filter: previous?.photoId === slot.photo.id && previous.filter === 'grayscale' ? 'grayscale' : 'none' }
  })]))
}

export function createPhotoSlotForAllBw(photo: PhotoAsset, allBwEnabled: boolean): FilledSlot {
  const slot = createInitialPhotoSlot(photo)
  return allBwEnabled ? { ...slot, filter: 'grayscale' } : slot
}
