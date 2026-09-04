import type { FilledSlot, PhotoAsset } from '../../types/selfBooth'
import { createInitialPhotoSlot } from './initialPhotoSlot'

export interface DirectPhotoTarget {
  templateId: string
  slotIndex: number
  slotCount: number
}

export function assignPhotoToTarget(
  frameSlots: Record<string, Array<FilledSlot | null>>,
  target: DirectPhotoTarget,
  photo: PhotoAsset,
) {
  if (!target.templateId || !Number.isInteger(target.slotIndex) || target.slotIndex < 0 || target.slotIndex >= target.slotCount) return frameSlots
  const existing = frameSlots[target.templateId] ?? Array.from({ length: target.slotCount }, () => null)
  const slots = [...existing]
  slots[target.slotIndex] = createInitialPhotoSlot(photo)
  return { ...frameSlots, [target.templateId]: slots }
}
