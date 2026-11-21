// Staff preview thumbnails generated on the customer's phone (plan PR 1).
// The staff page shows these through plain signed URLs, so Supabase Image
// Transformations (100 origin images/month on Pro) are never used.
// Best effort: a failed thumbnail never affects the customer's upload.

import { uploadPhotoToStorage } from './uploadClient'

export const THUMBNAIL_MAX_EDGE = 400
export const THUMBNAIL_QUALITY = 0.75

/** Same base name as the original, `.jpg` extension → server derives `_thumbs/<base>--<req>-thumb.jpg`. */
export function thumbnailFilename(originalName: string) {
  const dot = originalName.lastIndexOf('.')
  return `${dot > 0 ? originalName.slice(0, dot) : originalName}.jpg`
}

export function thumbnailSize(width: number, height: number, maxEdge = THUMBNAIL_MAX_EDGE) {
  const scale = Math.min(1, maxEdge / Math.max(width, height))
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

async function decode(file: File): Promise<{ source: CanvasImageSource; width: number; height: number; release: () => void }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file)
      return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() }
    } catch { /* fall back to <img> (older Safari) */ }
  }
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.decoding = 'async'
    image.src = url
    await image.decode()
    return { source: image, width: image.naturalWidth, height: image.naturalHeight, release: () => URL.revokeObjectURL(url) }
  } catch (reason) { URL.revokeObjectURL(url); throw reason }
}

export async function createThumbnail(file: File) {
  const decoded = await decode(file)
  try {
    const size = thumbnailSize(decoded.width, decoded.height)
    const canvas = document.createElement('canvas')
    canvas.width = size.width; canvas.height = size.height
    const context = canvas.getContext('2d', { alpha: false })
    if (!context) throw new Error('Canvas unavailable')
    context.fillStyle = '#ffffff'; context.fillRect(0, 0, size.width, size.height) // transparent PNG areas → white
    context.imageSmoothingQuality = 'high'
    context.drawImage(decoded.source, 0, 0, size.width, size.height)
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('Thumbnail encode failed')), 'image/jpeg', THUMBNAIL_QUALITY))
    canvas.width = 1; canvas.height = 1
    return new File([blob], thumbnailFilename(file.name), { type: 'image/jpeg' })
  } finally { decoded.release() }
}

let chain: Promise<void> = Promise.resolve()

/** Queues one thumbnail after its original was verified; runs one at a time in the background. */
export function queueThumbnailUpload(input: { file: File; thumbnail?: Promise<File | null>; phone: string; requestId: string }) {
  chain = chain.then(async () => {
    try {
      const thumbnail = (await input.thumbnail) ?? await createThumbnail(input.file)
      await uploadPhotoToStorage({ file: thumbnail, phone: input.phone, requestId: `${input.requestId}-thumb`, variant: 'thumbnail', onProgress: () => {}, onTiming: () => {} })
    } catch (reason) {
      console.warn('[photo-upload] thumbnail skipped', reason instanceof Error ? reason.name : 'unknown')
    }
  })
  return chain
}
