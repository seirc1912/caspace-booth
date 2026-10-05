import { applyColorLabPreset } from './processor'
import type { ColorLabPresetId } from './presets'
import { fitColorLabDimensions } from './dimensions'

export function fitWithinSource(width: number, height: number, maxEdge?: number) {
  return fitColorLabDimensions(width, height, maxEdge, 'render')
}

export async function renderColorLabImage(image: CanvasImageSource, sourceWidth: number, sourceHeight: number, presetId: ColorLabPresetId, intensity: number, seed: number, maxEdge?: number) {
  const dimensions = fitWithinSource(sourceWidth, sourceHeight, maxEdge)
  const canvas = document.createElement('canvas')
  canvas.width = dimensions.width; canvas.height = dimensions.height
  const context = canvas.getContext('2d', { alpha: true, willReadFrequently: true })
  if (!context) throw new Error('Color processing is unavailable in this browser.')
  context.drawImage(image, 0, 0, dimensions.width, dimensions.height)
  const original = context.getImageData(0, 0, dimensions.width, dimensions.height)
  const processed = applyColorLabPreset(original, presetId, intensity, seed)
  const imageData = context.createImageData(processed.width, processed.height)
  imageData.data.set(processed.data)
  context.putImageData(imageData, 0, 0)
  return canvas
}

export function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('The edited photo could not be exported.')), type, quality))
}

export async function deliverColorLabImage(blob: Blob, filename: string) {
  const file = new File([blob], filename, { type: blob.type })
  const shareData: ShareData = { files: [file] }
  try {
    if (typeof navigator.share === 'function' && (typeof navigator.canShare !== 'function' || navigator.canShare(shareData))) {
      await navigator.share(shareData)
      return 'shared' as const
    }
  } catch (reason) {
    if (reason instanceof DOMException && reason.name === 'AbortError') return 'cancelled' as const
  }
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url; anchor.download = filename; anchor.rel = 'noopener'
  document.body.appendChild(anchor); anchor.click(); anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  return 'downloaded' as const
}
