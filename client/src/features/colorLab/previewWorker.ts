/// <reference lib="webworker" />
import { ColorLabPreviewRuntime } from './previewRuntime'
import type { FilmEffectState, PixelBuffer } from './processor'
import type { ColorLabPresetId } from './presets'

type InitMessage = { type: 'init'; sourceId: string; width: number; height: number; seed: number; data: ArrayBuffer }
type RenderMessage = { type: 'render'; requestId: number; presetId: ColorLabPresetId; intensity: number; effects: FilmEffectState }
type IncomingMessage = InitMessage | RenderMessage

let runtime: ColorLabPreviewRuntime | null = null

self.onmessage = (event: MessageEvent<IncomingMessage>) => {
  const message = event.data
  if (message.type === 'init') {
    runtime?.dispose()
    const source: PixelBuffer = { width: message.width, height: message.height, data: new Uint8ClampedArray(message.data) }
    runtime = new ColorLabPreviewRuntime(message.sourceId, source, message.seed)
    self.postMessage({ type: 'ready' })
    return
  }
  if (!runtime) return
  try {
    const rendered = runtime.render(message.presetId, message.intensity, message.effects)
    self.postMessage({ type: 'result', requestId: message.requestId, width: rendered.width, height: rendered.height, data: rendered.data.buffer, metrics: runtime.metrics }, { transfer: [rendered.data.buffer] })
  } catch (reason) {
    self.postMessage({ type: 'error', requestId: message.requestId, message: reason instanceof Error ? reason.message : 'Preview could not be rendered.' })
  }
}
