// Staff preview thumbnails generated on the customer's phone (plan PR 1).
// The staff page shows these through plain signed URLs, so Supabase Image
// Transformations (100 origin images/month on Pro) are never used.
// Best effort: a failed thumbnail never affects the customer's upload.

import { uploadPhotoToStorage } from './uploadClient'

export const THUMBNAIL_MAX_EDGE = 400
export const THUMBNAIL_QUALITY = 0.75
// 1600px copy for the customer's large viewer, like booth previews (~250–400 KB); the server takes ≤ 2 MB.
export const PREVIEW_MAX_EDGE = 1600
export const PREVIEW_QUALITY = 0.82
const PREVIEW_MAX_BYTES = 2 * 1024 * 1024

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
  return resizedJpeg(file, THUMBNAIL_MAX_EDGE, THUMBNAIL_QUALITY)
}

/** 1600px JPEG for the large viewer; null when it cannot be made small enough (then the viewer uses the original). */
export async function createPreview(file: File) {
  for (const quality of [PREVIEW_QUALITY, 0.7]) {
    const preview = await resizedJpeg(file, PREVIEW_MAX_EDGE, quality)
    if (preview.size <= PREVIEW_MAX_BYTES) return preview
  }
  return null
}

async function resizedJpeg(file: File, maxEdge: number, quality: number) {
  const decoded = await decode(file)
  try {
    const size = thumbnailSize(decoded.width, decoded.height, maxEdge)
    const canvas = document.createElement('canvas')
    canvas.width = size.width; canvas.height = size.height
    const context = canvas.getContext('2d', { alpha: false })
    if (!context) throw new Error('Canvas unavailable')
    context.fillStyle = '#ffffff'; context.fillRect(0, 0, size.width, size.height) // transparent PNG areas → white
    context.imageSmoothingQuality = 'high'
    context.drawImage(decoded.source, 0, 0, size.width, size.height)
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('Thumbnail encode failed')), 'image/jpeg', quality))
    canvas.width = 1; canvas.height = 1
    return new File([blob], thumbnailFilename(file.name), { type: 'image/jpeg' })
  } finally { decoded.release() }
}

let thumbnailChain: Promise<void> = Promise.resolve()
let previewChain: Promise<void> = Promise.resolve()

/**
 * Queues one thumbnail (and, with `preview`, the 1600px viewer copy) after its original was
 * verified. Thumbnails (~30 KB) run one at a time on their own queue so the upload page can wait
 * for them before saying "đã gửi" — photos without one showed as black tiles when the customer
 * left early (28/11/2026). Previews follow on a second queue in the background; the viewer
 * falls back to the original when one is missing. Each copy is best effort and independent.
 */
export function queueThumbnailUpload(input: { file: File; thumbnail?: Promise<File | null>; phone: string; requestId: string; preview?: boolean }, deps: { upload?: typeof uploadPhotoToStorage; makeThumbnail?: typeof createThumbnail; makePreview?: typeof createPreview } = {}) {
  const upload = deps.upload ?? uploadPhotoToStorage
  const thumbnail = thumbnailChain = thumbnailChain.then(async () => {
    try {
      const file = (await input.thumbnail) ?? await (deps.makeThumbnail ?? createThumbnail)(input.file)
      await upload({ file, phone: input.phone, requestId: `${input.requestId}-thumb`, variant: 'thumbnail', onProgress: () => {}, onTiming: () => {} })
    } catch (reason) {
      console.warn('[photo-upload] thumbnail skipped', reason instanceof Error ? reason.name : 'unknown')
    }
  })
  if (!input.preview) return { thumbnail, done: thumbnail }
  const done = previewChain = previewChain.then(() => thumbnail).then(async () => {
    try {
      const preview = await (deps.makePreview ?? createPreview)(input.file)
      if (preview) await upload({ file: new File([preview], thumbnailFilename(input.file.name), { type: 'image/jpeg' }), phone: input.phone, requestId: `${input.requestId}-preview`, variant: 'preview', onProgress: () => {}, onTiming: () => {} })
    } catch (reason) {
      console.warn('[photo-upload] preview skipped', reason instanceof Error ? reason.name : 'unknown')
    }
  })
  return { thumbnail, done }
}
