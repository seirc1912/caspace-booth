import type { FilledSlot, PhotoAsset } from '../../types/selfBooth'
import { createInitialPhotoSlot } from './initialPhotoSlot'
export type FrameSlots = Record<string, Array<FilledSlot | null>>

const withGrayscale = (frameSlots: FrameSlots, grayscale: boolean): FrameSlots => Object.fromEntries(Object.entries(frameSlots).map(([templateId, slots]) => [templateId, slots.map((slot) => slot ? { ...slot, transform: { ...slot.transform, grayscale } } : null)]))

export function applyAllBwFilter(frameSlots: FrameSlots): FrameSlots { return withGrayscale(frameSlots, true) }

export function clearAllBwFilter(frameSlots: FrameSlots): FrameSlots { return withGrayscale(frameSlots, false) }

export function createPhotoSlotForAllBw(photo: PhotoAsset, allBwEnabled: boolean): FilledSlot {
  return createInitialPhotoSlot(photo, allBwEnabled)
}
