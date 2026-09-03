import type { FilledSlot, ImageTransform, PhotoAsset } from '../../types/selfBooth'

export const initialPhotoTransform: ImageTransform = { zoom: 1, rotation: 0, x: 0, y: 0, flipX: false, flipY: false }

export function createInitialPhotoSlot(photo: PhotoAsset): FilledSlot {
  return { photo, transform: { ...initialPhotoTransform }, fit: 'contain' }
}
