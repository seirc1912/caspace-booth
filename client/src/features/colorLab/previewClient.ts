import { fitColorLabDimensions } from './dimensions'
import type { FilmEffectState } from './processor'
import type { ColorLabPresetId } from './presets'

interface RenderRequest { presetId: ColorLabPresetId; intensity: number; effects: FilmEffectState }
interface RenderResult { requestId: number; width: number; height: number; data: Uint8ClampedArray }

export function isLatestPreviewRequest(requestId: number, latestRequestId: number) {
  return requestId === latestRequestId
}

export function preparePreviewPixels(image: CanvasImageSource, sourceWidth: number, sourceHeight: number, maxEdge = 1400) {
  const dimensions = fitColorLabDimensions(sourceWidth, sourceHeight, maxEdge, 'preview')
  const canvas = document.createElement('canvas')
  canvas.width = dimensions.width; canvas.height = dimensions.height
  const context = canvas.getContext('2d', { alpha: true, willReadFrequently: true })
  if (!context) throw new Error('Color processing is unavailable in this browser.')
  context.drawImage(image, 0, 0, dimensions.width, dimensions.height)
  const imageData = context.getImageData(0, 0, dimensions.width, dimensions.height)
  canvas.width = 1; canvas.height = 1
  return { ...dimensions, data: imageData.data }
}

export class ColorLabPreviewClient {
  private worker = new Worker(new URL('./previewWorker.ts', import.meta.url), { type: 'module' })
  private nextRequestId = 0
  private latestRequestId = 0
  private current: { requestId: number; request: RenderRequest; resolve: (value: RenderResult | null) => void; reject: (reason: Error) => void } | null = null
  private queued: { requestId: number; request: RenderRequest; resolve: (value: RenderResult | null) => void; reject: (reason: Error) => void } | null = null

  constructor(sourceId: string, width: number, height: number, seed: number, data: Uint8ClampedArray) {
    const transferable = data.slice()
    this.worker.postMessage({ type: 'init', sourceId, width, height, seed, data: transferable.buffer }, [transferable.buffer])
    this.worker.onmessage = (event: MessageEvent) => this.handleMessage(event.data)
  }

  render(request: RenderRequest) {
    const requestId = ++this.nextRequestId
    this.latestRequestId = requestId
    return new Promise<RenderResult | null>((resolve, reject) => {
      const next = { requestId, request, resolve, reject }
      if (this.current) {
        this.queued?.resolve(null)
        this.queued = next
      } else this.dispatch(next)
    })
  }

  private dispatch(next: NonNullable<ColorLabPreviewClient['current']>) {
    this.current = next
    this.worker.postMessage({ type: 'render', requestId: next.requestId, ...next.request })
  }

  private handleMessage(message: { type: string; requestId?: number; width?: number; height?: number; data?: ArrayBuffer; message?: string }) {
    if (message.type === 'ready') return
    const completed = this.current
    if (!completed || completed.requestId !== message.requestId) return
    this.current = null
    if (message.type === 'error') completed.reject(new Error(message.message))
    else if (message.requestId !== undefined && isLatestPreviewRequest(message.requestId, this.latestRequestId) && message.data && message.width && message.height) completed.resolve({ requestId: message.requestId, width: message.width, height: message.height, data: new Uint8ClampedArray(message.data) })
    else completed.resolve(null)
    if (this.queued) {
      const next = this.queued
      this.queued = null
      this.dispatch(next)
    }
  }

  dispose() {
    this.current?.resolve(null)
    this.queued?.resolve(null)
    this.current = null
    this.queued = null
    this.worker.terminate()
  }
}
