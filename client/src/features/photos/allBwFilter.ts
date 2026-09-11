import type { FilledSlot, PhotoAsset } from '../../types/selfBooth'
import { createInitialPhotoSlot } from './initialPhotoSlot'
export type FrameSlots = Record<string, Array<FilledSlot | null>>

export function applyAllBwFilter(frameSlots: FrameSlots): FrameSlots {
  return Object.fromEntries(Object.entries(frameSlots).map(([templateId, slots]) => [templateId, slots.map((slot) => slot ? { ...slot, filter: 'grayscale' as const } : null)]))
}

export function clearAllBwFilter(frameSlots: FrameSlots): FrameSlots {
  return Object.fromEntries(Object.entries(frameSlots).map(([templateId, slots]) => [templateId, slots.map((slot) => slot ? { ...slot, filter: 'none' as const } : null)]))
}

export function createPhotoSlotForAllBw(photo: PhotoAsset, allBwEnabled: boolean): FilledSlot {
  const slot = createInitialPhotoSlot(photo)
  return allBwEnabled ? { ...slot, filter: 'grayscale' } : slot
}
