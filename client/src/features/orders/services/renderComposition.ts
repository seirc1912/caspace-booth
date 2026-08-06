import type { FilledSlot, PrintTemplate } from '../../../types/selfBooth'

const loadImage = (source: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const image = new Image()
  image.onload = () => resolve(image)
  image.onerror = () => reject(new Error('A selected photo could not be decoded by this browser'))
  image.src = source
})

const canvasBlob = (canvas: HTMLCanvasElement, type: 'image/png' | 'image/jpeg', quality?: number) => new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Unable to create image artifact')), type, quality))

function drawCover(context: CanvasRenderingContext2D, image: HTMLImageElement, slot: FilledSlot, x: number, y: number, width: number, height: number) {
  const transform = slot.transform
  const baseScale = Math.max(width / image.naturalWidth, height / image.naturalHeight)
  const drawWidth = image.naturalWidth * baseScale
  const drawHeight = image.naturalHeight * baseScale
  context.save()
  context.beginPath()
  context.rect(x, y, width, height)
  context.clip()
  context.translate(x + width / 2 + transform.x * width, y + height / 2 + transform.y * height)
  context.rotate(transform.rotation * Math.PI / 180)
  context.scale(transform.flipX ? -transform.zoom : transform.zoom, transform.flipY ? -transform.zoom : transform.zoom)
  context.drawImage(image, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight)
  context.restore()
}

export async function renderComposition(template: PrintTemplate, slots: Array<FilledSlot | null>) {
  const canvas = document.createElement('canvas')
  canvas.width = template.canvas.width
  canvas.height = template.canvas.height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas rendering is unavailable')
  context.fillStyle = template.backgroundColor
  context.fillRect(0, 0, canvas.width, canvas.height)
  if (template.backgroundUrl) {
    const background = await loadImage(template.backgroundUrl)
    context.drawImage(background, 0, 0, canvas.width, canvas.height)
  }
  const ordered = template.slots.map((definition, index) => ({ definition, slot: slots[index] })).sort((left, right) => left.definition.zIndex - right.definition.zIndex)
  for (const { definition, slot } of ordered) {
    if (!slot) continue
    const image = await loadImage(slot.photo.src)
    context.save()
    context.translate(definition.x + definition.width / 2, definition.y + definition.height / 2)
    context.rotate(definition.rotation * Math.PI / 180)
    context.translate(-(definition.x + definition.width / 2), -(definition.y + definition.height / 2))
    drawCover(context, image, slot, definition.x, definition.y, definition.width, definition.height)
    context.restore()
  }
  const print = await canvasBlob(canvas, 'image/png')
  const previewCanvas = document.createElement('canvas')
  const scale = Math.min(1, 900 / canvas.width)
  previewCanvas.width = Math.round(canvas.width * scale)
  previewCanvas.height = Math.round(canvas.height * scale)
  previewCanvas.getContext('2d')?.drawImage(canvas, 0, 0, previewCanvas.width, previewCanvas.height)
  return { print, preview: await canvasBlob(previewCanvas, 'image/jpeg', 0.9) }
}
