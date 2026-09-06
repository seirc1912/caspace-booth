import type { FilledSlot, PhotoAsset } from '../../types/selfBooth'
import { createInitialPhotoSlot } from './initialPhotoSlot'

export interface FramePhotoTarget {
  templateId: string
  slotCount: number
  emptySlotIndices: number[]
}

export function createFramePhotoTarget(templateId: string, slots: Array<FilledSlot | null>): FramePhotoTarget {
  return {
    templateId,
    slotCount: slots.length,
    emptySlotIndices: slots.flatMap((slot, index) => slot ? [] : [index]),
  }
}

export function assignPhotosToFrameTarget(
  frameSlots: Record<string, Array<FilledSlot | null>>,
  target: FramePhotoTarget,
  photos: PhotoAsset[],
) {
  if (!target.templateId || target.slotCount < 1 || !photos.length) return frameSlots
  const existing = frameSlots[target.templateId] ?? Array.from({ length: target.slotCount }, () => null)
  if (existing.length !== target.slotCount) return frameSlots
  const slots = [...existing]
  let photoIndex = 0
  for (const slotIndex of target.emptySlotIndices) {
    if (photoIndex >= photos.length) break
    if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= target.slotCount || slots[slotIndex]) continue
    slots[slotIndex] = createInitialPhotoSlot(photos[photoIndex++]!)
  }
  return photoIndex ? { ...frameSlots, [target.templateId]: slots } : frameSlots
}
