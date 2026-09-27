import type { FilledSlot, ImageTransform, PhotoAsset } from '../../types/selfBooth'

export const initialPhotoTransform: ImageTransform = { zoom: 1.5, rotation: 0, x: 0, y: 0, flipX: false, flipY: false }

export function createInitialPhotoTransform(): ImageTransform {
  return { ...initialPhotoTransform }
}

export function createInitialPhotoSlot(photo: PhotoAsset): FilledSlot {
  return { photo, transform: createInitialPhotoTransform(), fit: 'contain', filter: 'none' }
}
