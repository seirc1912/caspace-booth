import type { FilledSlot, PhotoAsset } from '../../types/selfBooth'
import { createSlotTransform } from './slotTransform'

/** A new photo covers its slot, centred (Tự xếp / Vừa ô then move it to the face). */
export function createInitialPhotoSlot(photo: PhotoAsset, grayscale = false): FilledSlot {
  return { photo, transform: createSlotTransform(grayscale) }
}
