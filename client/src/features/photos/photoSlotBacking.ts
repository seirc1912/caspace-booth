export const photoSlotBackingColor = '#FFFFFF'

type FillContext = Pick<CanvasRenderingContext2D, 'fillRect' | 'fillStyle'>

export function fillPhotoSlotBacking(context: FillContext, x: number, y: number, width: number, height: number) {
  context.fillStyle = photoSlotBackingColor
  context.fillRect(x, y, width, height)
}
