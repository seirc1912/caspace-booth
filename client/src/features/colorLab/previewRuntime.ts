import { applyFilmEffects, COLOR_LAB_RENDER_VERSION, createFilmEffectCache, renderBaseColorImage, type BaseColorBuffer, type FilmEffectState, type PixelBuffer } from './processor'
import type { ColorLabPresetId } from './presets'

const MAX_BASE_RENDERS = 2

export interface PreviewRuntimeMetrics {
  baseRenders: number
  baseCacheHits: number
  grainGenerations: number
  dustGenerations: number
}

export class ColorLabPreviewRuntime {
  readonly metrics: PreviewRuntimeMetrics = { baseRenders: 0, baseCacheHits: 0, grainGenerations: 0, dustGenerations: 0 }
  private readonly baseCache = new Map<string, BaseColorBuffer>()
  private readonly effectCache = createFilmEffectCache()
  private sourceId: string
  private source: PixelBuffer
  private seed: number

  constructor(sourceId: string, source: PixelBuffer, seed: number) {
    this.sourceId = sourceId
    this.source = source
    this.seed = seed
  }

  render(presetId: ColorLabPresetId, intensity: number, effects: FilmEffectState) {
    const key = `${this.sourceId}:${this.source.width}x${this.source.height}:${presetId}:${intensity}:${COLOR_LAB_RENDER_VERSION}`
    let base = this.baseCache.get(key)
    if (base) {
      this.baseCache.delete(key)
      this.baseCache.set(key, base)
      this.metrics.baseCacheHits += 1
    } else {
      base = renderBaseColorImage(this.source, presetId, intensity, this.seed)
      this.baseCache.set(key, base)
      this.metrics.baseRenders += 1
      while (this.baseCache.size > MAX_BASE_RENDERS) this.baseCache.delete(this.baseCache.keys().next().value!)
    }
    const rendered = applyFilmEffects(this.source, base, effects, this.seed, this.effectCache)
    this.metrics.grainGenerations = this.effectCache.grainGenerations
    this.metrics.dustGenerations = this.effectCache.dustGenerations
    return rendered
  }

  dispose() {
    this.baseCache.clear()
    this.effectCache.grain = undefined
    this.effectCache.defects = undefined
    this.source = { width: 1, height: 1, data: new Uint8ClampedArray(4) }
  }
}
