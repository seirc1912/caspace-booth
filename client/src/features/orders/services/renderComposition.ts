import type { BrandingConfig } from '../../../types/branding'
import type { FilledSlot, PrintTemplate, TemplateElement, TemplateVariable } from '../../../types/selfBooth'
import { basePhotoFitScale } from '../../photos/photoFit'
import { grayscaleRgbaPixels } from '../../photos/photoFilter'
import { fillPhotoSlotBacking } from '../../photos/photoSlotBacking'

export type ImageExportFormat = 'png' | 'jpg'
export type ExportProgress = (progress: number) => void

interface RenderOptions {
  branding?: BrandingConfig
  createPreview?: boolean
  format?: ImageExportFormat
  quality?: number
  onProgress?: ExportProgress
  assetCache?: RenderAssetCache
  onTiming?: (timing: RenderTiming) => void
}

export interface RenderTiming {
  assetPreparationMs: number
  renderMs: number
  pngEncodingMs: number
  pngBytes: number
}

export type CompositionAssetType = 'customer-photo' | 'template-background' | 'template-element' | 'brand-logo'

export class CompositionAssetError extends Error {
  readonly assetType: CompositionAssetType
  readonly scheme: string
  readonly stage: 'fetch' | 'decode'
  readonly status?: number
  constructor(
    message: string,
    assetType: CompositionAssetType,
    scheme: string,
    stage: 'fetch' | 'decode',
    status?: number,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'CompositionAssetError'
    this.assetType = assetType
    this.scheme = scheme
    this.stage = stage
    this.status = status
  }
}

const sourceScheme = (source: string) => source.match(/^([a-z][a-z0-9+.-]*):/i)?.[1]?.toLowerCase() ?? 'relative'
const retryDelays = [250, 650]
const delay = (ms: number) => new Promise((resolve) => globalThis.setTimeout(resolve, ms))
const transientStatus = (status: number) => status === 408 || status === 429 || status >= 500

export class RenderAssetCache {
  private readonly images = new Map<string, Promise<HTMLImageElement>>()
  private readonly fetchedUrls = new Map<string, string>()

  load(source: string, assetType: CompositionAssetType) {
    let image = this.images.get(source)
    if (!image) {
      image = loadImageForExport(source, assetType, (url) => this.fetchedUrls.set(source, url))
      this.images.set(source, image)
      void image.catch(() => this.images.delete(source))
    }
    return image
  }

  clear() {
    this.images.clear()
    this.fetchedUrls.forEach((url) => URL.revokeObjectURL(url))
    this.fetchedUrls.clear()
  }

  retainOnly(sources: Iterable<string>) {
    const retained = new Set(sources)
    for (const source of this.images.keys()) {
      if (!retained.has(source)) {
        this.images.delete(source)
        const fetchedUrl = this.fetchedUrls.get(source)
        if (fetchedUrl) URL.revokeObjectURL(fetchedUrl)
        this.fetchedUrls.delete(source)
      }
    }
  }
}

export const compositionAssetSources = (template: PrintTemplate, slots: Array<FilledSlot | null>, branding?: BrandingConfig) => [...new Set([
  template.backgroundUrl,
  ...slots.map((slot) => slot?.photo.src),
  ...template.elements.map((element) => element.visible && element.assetUrl ? element.assetUrl : undefined),
  ...template.variables.map((variable) => variable.type === 'brandLogo' ? branding?.logoUrl : undefined),
].filter((source): source is string => Boolean(source)))]

const compositionAssets = (template: PrintTemplate, slots: Array<FilledSlot | null>, branding?: BrandingConfig) => [
  template.backgroundUrl ? { source: template.backgroundUrl, type: 'template-background' as const } : null,
  ...slots.map((slot) => slot ? { source: slot.photo.src, type: 'customer-photo' as const } : null),
  ...template.elements.map((element) => element.visible && element.assetUrl ? { source: element.assetUrl, type: 'template-element' as const } : null),
  ...template.variables.map((variable) => variable.type === 'brandLogo' && branding?.logoUrl ? { source: branding.logoUrl, type: 'brand-logo' as const } : null),
].filter((asset): asset is { source: string; type: CompositionAssetType } => Boolean(asset))

const errorMessage = (reason: unknown) => reason instanceof Error ? reason.message : String(reason)

const isCrossOriginHttpSource = (source: string) => {
  if (!/^https?:/i.test(source)) return false
  try { return new URL(source, window.location.href).origin !== window.location.origin }
  catch { return false }
}

const decodeImageElement = (source: string, assetType: CompositionAssetType, canonicalScheme = sourceScheme(source)) => new Promise<HTMLImageElement>((resolve, reject) => {
  if (typeof source !== 'string' || !source) { reject(new CompositionAssetError('Image source is empty.', assetType, canonicalScheme, 'decode')); return }
  const image = new Image()
  let settled = false
  const succeed = () => {
    if (settled) return
    if (!Number.isFinite(image.naturalWidth) || !Number.isFinite(image.naturalHeight) || image.naturalWidth <= 0 || image.naturalHeight <= 0) {
      settled = true
      reject(new CompositionAssetError(`Image has invalid dimensions (${assetType}, ${canonicalScheme}:).`, assetType, canonicalScheme, 'decode'))
      return
    }
    settled = true
    resolve(image)
  }
  const fail = () => {
    if (settled) return
    settled = true
    reject(new CompositionAssetError(`Image decode failed (${assetType}, ${canonicalScheme}:). The source may be revoked, unsupported, or blocked by CORS.`, assetType, canonicalScheme, 'decode'))
  }
  image.decoding = 'async'
  if (isCrossOriginHttpSource(source)) image.crossOrigin = 'anonymous'
  image.onload = succeed
  image.onerror = fail
  image.src = source
})

export async function fetchRemoteAsset(source: string, assetType: CompositionAssetType) {
  for (let attempt = 0; ; attempt += 1) {
    const controller = new AbortController()
    const timeout = globalThis.setTimeout(() => controller.abort(), 15_000)
    try {
      const response = await fetch(source, { mode: 'cors', cache: attempt ? 'reload' : 'default', signal: controller.signal })
      if (!response.ok) {
        const error = new CompositionAssetError(`Remote image fetch failed (${assetType}, https:, HTTP ${response.status}).`, assetType, 'https', 'fetch', response.status)
        if (attempt >= retryDelays.length || !transientStatus(response.status)) throw error
      } else {
        const blob = await response.blob()
        if (!blob.size) throw new CompositionAssetError(`Remote image fetch returned an empty file (${assetType}, https:).`, assetType, 'https', 'fetch', response.status)
        return blob
      }
    } catch (reason) {
      if (reason instanceof CompositionAssetError && (attempt >= retryDelays.length || reason.status === undefined || !transientStatus(reason.status))) throw reason
      if (attempt >= retryDelays.length) {
        const aborted = reason instanceof DOMException && reason.name === 'AbortError'
        throw new CompositionAssetError(`Remote image ${aborted ? 'timed out' : 'fetch failed'} (${assetType}, https:).`, assetType, 'https', 'fetch', undefined, { cause: reason })
      }
    } finally { globalThis.clearTimeout(timeout) }
    await delay(retryDelays[attempt]!)
  }
}

async function loadImageForExport(source: string, assetType: CompositionAssetType, retainFetchedUrl?: (url: string) => void) {
  if (/^https?:/i.test(source)) {
    const blob = await fetchRemoteAsset(source, assetType)
    const fetchedUrl = URL.createObjectURL(blob)
    retainFetchedUrl?.(fetchedUrl)
    try {
      const image = await decodeImageElement(fetchedUrl, assetType, sourceScheme(source))
      if (!retainFetchedUrl) URL.revokeObjectURL(fetchedUrl)
      return image
    } catch (reason) { if (!retainFetchedUrl) URL.revokeObjectURL(fetchedUrl); throw reason }
  }
  return decodeImageElement(source, assetType)
}

const loadImage = (source: string, assetType: CompositionAssetType, cache?: RenderAssetCache) => cache?.load(source, assetType) ?? loadImageForExport(source, assetType)

const canvasBlob = (canvas: HTMLCanvasElement, type: 'image/png' | 'image/jpeg', quality?: number) => new Promise<Blob>((resolve, reject) => {
  try { canvas.toBlob((blob) => blob && blob.size > 0 ? resolve(blob) : reject(new Error('Failed to render print image: the browser returned an empty image.')), type, quality) }
  catch (reason) { reject(new Error(`Failed to render print image: ${errorMessage(reason)}`)) }
})

function validateCanvas(template: PrintTemplate) {
  const { width, height } = template.canvas
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) throw new Error('The template has invalid export dimensions.')
  const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
  const maximumPixels = mobile ? 24_000_000 : 64_000_000
  if (width * height > maximumPixels) throw new Error(`This ${width}×${height} template is too large to export safely on this device.`)
}

function framePath(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, mask: 'rectangle' | 'rounded' | 'circle' | 'ellipse', radius: number) {
  context.beginPath()
  if (mask === 'circle' || mask === 'ellipse') context.ellipse(x + width / 2, y + height / 2, width / 2, height / 2, 0, 0, Math.PI * 2)
  else if (mask === 'rounded' || radius > 0) context.roundRect(x, y, width, height, Math.min(Math.max(0, radius), width / 2, height / 2))
  else context.rect(x, y, width, height)
}

function grayscalePhotoSource(image: HTMLImageElement) {
  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth
  canvas.height = image.naturalHeight
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('Canvas rendering is unavailable on this device.')
  context.drawImage(image, 0, 0)
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height)
  grayscaleRgbaPixels(imageData.data)
  context.putImageData(imageData, 0, 0)
  return canvas
}

function drawPhoto(context: CanvasRenderingContext2D, image: HTMLImageElement, source: CanvasImageSource, slot: FilledSlot, x: number, y: number, width: number, height: number, mask: 'rectangle' | 'rounded' | 'circle' | 'ellipse', radius: number) {
  const transform = slot.transform
  const baseScale = basePhotoFitScale(
    { width: image.naturalWidth, height: image.naturalHeight },
    { width, height },
    slot.fit ?? 'contain',
  )
  const drawWidth = image.naturalWidth * baseScale
  const drawHeight = image.naturalHeight * baseScale
  context.save()
  framePath(context, x, y, width, height, mask, radius)
  context.clip()
  fillPhotoSlotBacking(context, x, y, width, height)
  context.translate(x + width / 2 + transform.x * width, y + height / 2 + transform.y * height)
  context.rotate(transform.rotation * Math.PI / 180)
  context.scale(transform.flipX ? -transform.zoom : transform.zoom, transform.flipY ? -transform.zoom : transform.zoom)
  context.drawImage(source, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight)
  context.restore()
}

function variableValue(variable: TemplateVariable, branding?: BrandingConfig) {
  const now = new Date()
  const values: Record<TemplateVariable['type'], string> = {
    brandLogo: '', brandName: branding?.brandName ?? 'Cá Space', website: branding?.websiteLabel ?? 'caspace.vn',
    date: now.toLocaleDateString(), time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), qrCode: 'QR', customText: variable.value ?? '',
  }
  return values[variable.type]
}

function drawText(context: CanvasRenderingContext2D, value: string, x: number, y: number, width: number, height: number, fontSize: number, color: string, align: 'left' | 'center' | 'right', fontFamily = 'Inter, Arial, sans-serif', fontWeight = 700, letterSpacing = 0) {
  context.save()
  context.beginPath(); context.rect(x, y, width, height); context.clip()
  context.fillStyle = color
  context.font = `${fontWeight} ${fontSize}px ${fontFamily}`
  context.textAlign = align
  context.textBaseline = 'middle'
  const startX = align === 'left' ? x : align === 'right' ? x + width : x + width / 2
  if (letterSpacing && 'letterSpacing' in context) context.letterSpacing = `${letterSpacing}px`
  context.fillText(value, startX, y + height / 2, width)
  context.restore()
}

async function drawElement(context: CanvasRenderingContext2D, element: TemplateElement, cache?: RenderAssetCache) {
  if (!element.visible) return
  context.save()
  context.globalAlpha = Math.min(1, Math.max(0, element.opacity))
  context.translate(element.x + element.width / 2, element.y + element.height / 2)
  context.rotate(element.rotation * Math.PI / 180)
  context.translate(-element.width / 2, -element.height / 2)
  if (element.shadowBlur) { context.shadowColor = element.shadowColor ?? '#000000'; context.shadowBlur = element.shadowBlur; context.shadowOffsetX = element.shadowX ?? 0; context.shadowOffsetY = element.shadowY ?? 0 }
  if ((element.type === 'image' || element.type === 'logo' || element.type === 'sticker' || element.type === 'overlay') && element.assetUrl) {
    const image = await loadImage(element.assetUrl, 'template-element', cache)
    const scale = Math.min(element.width / image.naturalWidth, element.height / image.naturalHeight)
    const width = image.naturalWidth * scale; const height = image.naturalHeight * scale
    context.drawImage(image, (element.width - width) / 2, (element.height - height) / 2, width, height)
  } else if (element.type === 'shape') {
    context.beginPath()
    if (element.shape === 'circle') context.ellipse(element.width / 2, element.height / 2, element.width / 2, element.height / 2, 0, 0, Math.PI * 2)
    else if (element.shape === 'line') { context.moveTo(0, element.height / 2); context.lineTo(element.width, element.height / 2) }
    else context.rect(0, 0, element.width, element.height)
    if (element.shape !== 'line') { context.fillStyle = element.fill ?? 'transparent'; context.fill() }
    if (element.stroke) { context.strokeStyle = element.stroke; context.lineWidth = element.shape === 'line' ? 2 : 1; context.stroke() }
  } else {
    drawText(context, element.content ?? (element.type === 'qrCode' ? 'QR' : `{${element.variableType ?? 'customText'}}`), 0, 0, element.width, element.height, element.fontSize ?? 32, element.color ?? '#000000', element.textAlign ?? 'left', element.fontFamily, element.fontWeight, element.letterSpacing)
  }
  context.restore()
}

export function renderComposition(template: PrintTemplate, slots: Array<FilledSlot | null>, options: RenderOptions & { createPreview: false }): Promise<{ print: Blob; preview: null; width: number; height: number; format: ImageExportFormat }>
export function renderComposition(template: PrintTemplate, slots: Array<FilledSlot | null>, options?: RenderOptions): Promise<{ print: Blob; preview: Blob; width: number; height: number; format: ImageExportFormat }>
export async function renderComposition(template: PrintTemplate, slots: Array<FilledSlot | null>, options: RenderOptions = {}) {
  validateCanvas(template)
  const startedAt = performance.now()
  const format = options.format ?? 'png'
  const assets = compositionAssets(template, slots, options.branding)
  await Promise.all(assets.map((asset) => loadImage(asset.source, asset.type, options.assetCache)))
  const assetsReadyAt = performance.now()
  const canvas = document.createElement('canvas')
  canvas.width = template.canvas.width; canvas.height = template.canvas.height
  const context = canvas.getContext('2d', { alpha: format === 'png' })
  if (!context) throw new Error('Canvas rendering is unavailable on this device.')
  const grayscaleSources = new Map<string, HTMLCanvasElement>()
  options.onProgress?.(5)
  if (format === 'jpg') { context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height) }
  if (template.backgroundColor && template.backgroundColor !== 'transparent') { context.fillStyle = template.backgroundColor; context.fillRect(0, 0, canvas.width, canvas.height) }
  if (template.backgroundUrl) { const background = await loadImage(template.backgroundUrl, 'template-background', options.assetCache); context.drawImage(background, 0, 0, canvas.width, canvas.height) }

  const layers = [
    ...template.slots.map((definition, index) => ({ kind: 'slot' as const, zIndex: definition.zIndex, definition, index })),
    ...template.variables.map((variable) => ({ kind: 'variable' as const, zIndex: variable.zIndex, variable })),
    ...template.elements.map((element) => ({ kind: 'element' as const, zIndex: element.zIndex, element })),
  ].sort((left, right) => left.zIndex - right.zIndex)
  for (let layerIndex = 0; layerIndex < layers.length; layerIndex += 1) {
    const layer = layers[layerIndex]
    if (layer.kind === 'slot') {
      const definition = layer.definition; const slot = slots[layer.index]
      if (slot && definition.visible !== false) {
        const image = await loadImage(slot.photo.src, 'customer-photo', options.assetCache)
        let source: CanvasImageSource = image
        if (slot.filter === 'grayscale') {
          let grayscale = grayscaleSources.get(slot.photo.src)
          if (!grayscale) { grayscale = grayscalePhotoSource(image); grayscaleSources.set(slot.photo.src, grayscale) }
          source = grayscale
        }
        context.save(); context.globalAlpha = definition.opacity ?? 1
        context.translate(definition.x + definition.width / 2, definition.y + definition.height / 2)
        context.rotate(definition.rotation * Math.PI / 180)
        context.translate(-(definition.x + definition.width / 2), -(definition.y + definition.height / 2))
        if (definition.shadow?.blur) { context.shadowColor = definition.shadow.color; context.shadowBlur = definition.shadow.blur; context.shadowOffsetX = definition.shadow.offsetX; context.shadowOffsetY = definition.shadow.offsetY }
        drawPhoto(context, image, source, slot, definition.x, definition.y, definition.width, definition.height, definition.mask ?? 'rectangle', definition.borderRadius)
        context.shadowColor = 'transparent'
        if (definition.borderWidth) { framePath(context, definition.x, definition.y, definition.width, definition.height, definition.mask ?? 'rectangle', definition.borderRadius); context.strokeStyle = definition.borderColor ?? '#000000'; context.lineWidth = definition.borderWidth; context.stroke() }
        context.restore()
      }
    } else if (layer.kind === 'variable') {
      const variable = layer.variable
      if (variable.type === 'brandLogo' && options.branding?.logoUrl) { const image = await loadImage(options.branding.logoUrl, 'brand-logo', options.assetCache); context.drawImage(image, variable.x, variable.y, variable.width, variable.height) }
      else drawText(context, variableValue(variable, options.branding), variable.x, variable.y, variable.width, variable.height, variable.fontSize, variable.color, variable.align)
    } else await drawElement(context, layer.element, options.assetCache)
    options.onProgress?.(10 + Math.round((layerIndex + 1) / Math.max(1, layers.length) * 75))
  }
  options.onProgress?.(90)
  const renderedAt = performance.now()
  const print = await canvasBlob(canvas, format === 'png' ? 'image/png' : 'image/jpeg', format === 'jpg' ? options.quality ?? 0.95 : undefined)
  const encodedAt = performance.now()
  options.onTiming?.({ assetPreparationMs: assetsReadyAt - startedAt, renderMs: renderedAt - assetsReadyAt, pngEncodingMs: encodedAt - renderedAt, pngBytes: print.size })
  if (options.createPreview === false) {
    canvas.width = 1; canvas.height = 1; options.onProgress?.(100)
    return { print, preview: null, width: template.canvas.width, height: template.canvas.height, format }
  }
  const previewCanvas = document.createElement('canvas')
  const scale = Math.min(1, 900 / canvas.width)
  previewCanvas.width = Math.max(1, Math.round(canvas.width * scale)); previewCanvas.height = Math.max(1, Math.round(canvas.height * scale))
  previewCanvas.getContext('2d')?.drawImage(canvas, 0, 0, previewCanvas.width, previewCanvas.height)
  const preview = await canvasBlob(previewCanvas, 'image/jpeg', 0.9)
  canvas.width = 1; canvas.height = 1
  previewCanvas.width = 1; previewCanvas.height = 1
  options.onProgress?.(100)
  return { print, preview, width: template.canvas.width, height: template.canvas.height, format }
}
