import { deliverImageFile } from '../orders/services/saveComposition'
import { renderFilmImage, type FilmEffectState } from './processor'
import type { ColorLabPresetId } from './presets'
import { fitColorLabDimensions } from './dimensions'

export function fitWithinSource(width: number, height: number, maxEdge?: number) {
  return fitColorLabDimensions(width, height, maxEdge, 'render')
}

export async function renderColorLabImage(image: CanvasImageSource, sourceWidth: number, sourceHeight: number, presetId: ColorLabPresetId, intensity: number, seed: number, maxEdge?: number, effects?: FilmEffectState) {
  const dimensions = fitWithinSource(sourceWidth, sourceHeight, maxEdge)
  const canvas = document.createElement('canvas')
  canvas.width = dimensions.width; canvas.height = dimensions.height
  const context = canvas.getContext('2d', { alpha: true, willReadFrequently: true })
  if (!context) throw new Error('Color processing is unavailable in this browser.')
  context.drawImage(image, 0, 0, dimensions.width, dimensions.height)
  const original = context.getImageData(0, 0, dimensions.width, dimensions.height)
  const processed = renderFilmImage(original, presetId, intensity, seed, effects)
  const imageData = context.createImageData(processed.width, processed.height)
  imageData.data.set(processed.data)
  context.putImageData(imageData, 0, 0)
  return canvas
}

export function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('The edited photo could not be exported.')), type, quality))
}

/** iPhone: share sheet ("Lưu hình ảnh"); Android/desktop: straight download. */
export function deliverColorLabImage(blob: Blob, filename: string) {
  return deliverImageFile(blob, filename)
}
