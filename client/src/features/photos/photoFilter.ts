import type { FilledSlot } from '../../types/selfBooth'

export type PhotoFilter = NonNullable<FilledSlot['filter']>

export const photoFilterCss = (filter: FilledSlot['filter']) => filter === 'grayscale' ? 'grayscale(1)' : 'none'

export function withPhotoFilter(slot: FilledSlot, filter: PhotoFilter): FilledSlot {
  return { ...slot, filter }
}

export function drawWithPhotoFilter(context: Pick<CanvasRenderingContext2D, 'filter'>, filter: FilledSlot['filter'], draw: () => void) {
  const previous = context.filter
  context.filter = photoFilterCss(filter)
  try { draw() }
  finally { context.filter = previous }
}

export function grayscaleRgbaPixels(pixels: Uint8ClampedArray) {
  for (let index = 0; index + 3 < pixels.length; index += 4) {
    const grayscale = Math.round(pixels[index]! * 0.2126 + pixels[index + 1]! * 0.7152 + pixels[index + 2]! * 0.0722)
    pixels[index] = grayscale
    pixels[index + 1] = grayscale
    pixels[index + 2] = grayscale
  }
  return pixels
}
