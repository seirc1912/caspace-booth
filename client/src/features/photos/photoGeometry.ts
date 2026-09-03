import type { ImageTransform } from '../../types/selfBooth'

export interface ImageSize { width: number; height: number }

export function coverSize(photo: ImageSize, slot: ImageSize): ImageSize {
  const scale = Math.max(slot.width / photo.width, slot.height / photo.height)
  return { width: photo.width * scale, height: photo.height * scale }
}

export function minimumCoverZoom(photo: ImageSize, slot: ImageSize) {
  const covered = coverSize(photo, slot)
  return Math.max(slot.width / covered.width, slot.height / covered.height)
}

export function constrainCoverTransform(transform: ImageTransform, photo: ImageSize, slot: ImageSize): ImageTransform {
  if (![photo.width, photo.height, slot.width, slot.height].every((value) => Number.isFinite(value) && value > 0)) return transform
  const base = coverSize(photo, slot)
  const minimumZoom = minimumCoverZoom(photo, slot)
  const zoom = Math.max(minimumZoom, transform.zoom)
  const maximumX = Math.max(0, (base.width * zoom - slot.width) / (2 * slot.width))
  const maximumY = Math.max(0, (base.height * zoom - slot.height) / (2 * slot.height))
  return {
    ...transform,
    zoom,
    x: Math.min(maximumX, Math.max(-maximumX, transform.x)),
    y: Math.min(maximumY, Math.max(-maximumY, transform.y)),
  }
}
