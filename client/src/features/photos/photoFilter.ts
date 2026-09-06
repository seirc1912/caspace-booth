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
