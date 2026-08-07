import type { PhotoAsset } from '../../types/selfBooth'

function photoId() {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID()
  const values = new Uint32Array(4)
  globalThis.crypto?.getRandomValues?.(values)
  return `${Date.now().toString(36)}-${Array.from(values, (value) => value.toString(36)).join('-')}-${Math.random().toString(36).slice(2)}`
}

export function loadPhotoFile(file: File): Promise<PhotoAsset> {
  return new Promise((resolve, reject) => {
    const supportedExtension = /\.(?:jpe?g|png|heic|heif)$/i.test(file?.name ?? '')
    if (!(file instanceof File) || (!file.type.startsWith('image/') && !supportedExtension)) { reject(new Error('Please choose a supported image file.')); return }
    const src = URL.createObjectURL(file)
    const image = new Image()
    const releaseImage = () => { image.onload = null; image.onerror = null; image.src = '' }
    image.onload = async () => {
      if (!image.src || !Number.isFinite(image.naturalWidth) || !Number.isFinite(image.naturalHeight) || image.naturalWidth <= 0 || image.naturalHeight <= 0) {
        releaseImage(); URL.revokeObjectURL(src); reject(new Error(`${file.name || 'This image'} has invalid dimensions.`)); return
      }
      try {
        // Safari may display an HEIC upload but reject it when export decodes the
        // original file into a second canvas. Normalize it once at ingestion so
        // editing and export use the exact same browser-decodable source.
        const exportMaxEdge = 4096
        const exportScale = Math.min(1, exportMaxEdge / Math.max(image.naturalWidth, image.naturalHeight))
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(image.naturalWidth * exportScale))
        canvas.height = Math.max(1, Math.round(image.naturalHeight * exportScale))
        const context = canvas.getContext('2d', { alpha: true })
        if (!context) throw new Error('Image preview is unavailable')
        context.drawImage(image, 0, 0, canvas.width, canvas.height)
        const preserveAlpha = file.type === 'image/png' || /\.png$/i.test(file.name)
        const exportBlob = await new Promise<Blob>((resolveBlob, rejectBlob) => canvas.toBlob((blob) => blob ? resolveBlob(blob) : rejectBlob(new Error('Image could not be prepared for export')), preserveAlpha ? 'image/png' : 'image/jpeg', 0.98))
        const exportSrc = URL.createObjectURL(exportBlob)
        const previewScale = Math.min(1, 1600 / Math.max(canvas.width, canvas.height))
        const previewCanvas = document.createElement('canvas')
        previewCanvas.width = Math.max(1, Math.round(canvas.width * previewScale))
        previewCanvas.height = Math.max(1, Math.round(canvas.height * previewScale))
        const previewContext = previewCanvas.getContext('2d', { alpha: true })
        if (!previewContext) throw new Error('Image preview is unavailable')
        previewContext.drawImage(canvas, 0, 0, previewCanvas.width, previewCanvas.height)
        const previewBlob = await new Promise<Blob>((resolveBlob, rejectBlob) => previewCanvas.toBlob((blob) => blob ? resolveBlob(blob) : rejectBlob(new Error('Image preview could not be created')), preserveAlpha ? 'image/png' : 'image/jpeg', 0.9))
        context.clearRect(0, 0, canvas.width, canvas.height); canvas.width = 1; canvas.height = 1
        previewCanvas.width = 1; previewCanvas.height = 1
        releaseImage()
        URL.revokeObjectURL(src)
        resolve({ id: `phone-${photoId()}`, src: exportSrc, previewSrc: URL.createObjectURL(previewBlob), alt: file.name || 'Uploaded photo', source: 'phone' })
      } catch (reason) {
        releaseImage()
        URL.revokeObjectURL(src)
        reject(reason instanceof Error ? reason : new Error(`${file.name || 'This image'} could not be prepared.`))
      }
    }
    image.onerror = () => { releaseImage(); URL.revokeObjectURL(src); reject(new Error(`${file.name || 'This image'} could not be loaded.`)) }
    image.src = src
  })
}
