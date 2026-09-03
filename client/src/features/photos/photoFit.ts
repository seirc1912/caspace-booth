export interface ImageSize { width: number; height: number }

export type PhotoFit = 'contain' | 'cover'

export const minimumUserPhotoZoom = 0.25
export const maximumUserPhotoZoom = 6

export function clampUserPhotoZoom(value: number) {
  return Math.min(maximumUserPhotoZoom, Math.max(minimumUserPhotoZoom, value))
}

function validSize(size: ImageSize) {
  return Number.isFinite(size.width) && Number.isFinite(size.height) && size.width > 0 && size.height > 0
}

export function basePhotoFitScale(photo: ImageSize, slot: ImageSize, fit: PhotoFit) {
  if (!validSize(photo) || !validSize(slot)) throw new Error('Photo and slot dimensions must be positive finite numbers.')
  const widthScale = slot.width / photo.width
  const heightScale = slot.height / photo.height
  return fit === 'cover' ? Math.max(widthScale, heightScale) : Math.min(widthScale, heightScale)
}

export function effectivePhotoScale(photo: ImageSize, slot: ImageSize, fit: PhotoFit, userZoom: number) {
  return basePhotoFitScale(photo, slot, fit) * userZoom
}
