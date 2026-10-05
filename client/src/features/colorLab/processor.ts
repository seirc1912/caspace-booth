import { getColorLabPreset, type ColorLabPresetId } from './presets'
import { requireSafeDimensions } from './dimensions'

export interface PixelBuffer { data: Uint8ClampedArray; width: number; height: number }

const clamp01 = (value: number) => Math.max(0, Math.min(1, value))
const luminanceOf = (r: number, g: number, b: number) => r * 0.2126 + g * 0.7152 + b * 0.0722
const hash = (value: number) => {
  let x = value | 0
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b)
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b)
  return ((x ^ (x >>> 16)) >>> 0) / 4294967295
}
const textureSeedFor = (seed: number, id: string) => {
  let result = seed | 0
  for (let index = 0; index < id.length; index += 1) result = Math.imul(result ^ id.charCodeAt(index), 16777619)
  return result | 0
}
const channelAt = (source: Uint8ClampedArray, width: number, height: number, x: number, y: number, channel: number) => {
  const safeX = Math.max(0, Math.min(width - 1, x))
  const safeY = Math.max(0, Math.min(height - 1, y))
  return source[(safeY * width + safeX) * 4 + channel]! / 255
}

function softChannel(source: Uint8ClampedArray, width: number, height: number, x: number, y: number, channel: number, radius: number) {
  return (channelAt(source, width, height, x, y, channel) * 4
    + channelAt(source, width, height, x - radius, y, channel)
    + channelAt(source, width, height, x + radius, y, channel)
    + channelAt(source, width, height, x, y - radius, channel)
    + channelAt(source, width, height, x, y + radius, channel)) / 8
}

function highlightNeighbour(source: Uint8ClampedArray, width: number, height: number, x: number, y: number, threshold: number): [number, number, number] {
  const total = [0, 0, 0]
  let weight = 0
  const offsets = [[0, 0], [-2, 0], [2, 0], [0, -2], [0, 2]] as const
  for (const [offsetX, offsetY] of offsets) {
    const r = channelAt(source, width, height, x + offsetX, y + offsetY, 0)
    const g = channelAt(source, width, height, x + offsetX, y + offsetY, 1)
    const b = channelAt(source, width, height, x + offsetX, y + offsetY, 2)
    const mask = clamp01((luminanceOf(r, g, b) - threshold) / Math.max(0.01, 1 - threshold))
    const weightedMask = mask * mask
    total[0] += r * weightedMask; total[1] += g * weightedMask; total[2] += b * weightedMask
    weight += weightedMask
  }
  return weight ? [total[0]! / weight, total[1]! / weight, total[2]! / weight] : [0, 0, 0]
}

function filmTone(value: number, contrast: number, blackLift: number, compression: number) {
  const lifted = blackLift + value * (1 - blackLift)
  const contrasted = (lifted - 0.5) * contrast + 0.5
  const shoulder = Math.max(0, contrasted - 0.58) / 0.42
  return clamp01(contrasted - compression * shoulder * shoulder * 0.24)
}

export function applyColorLabPreset(source: PixelBuffer, presetId: ColorLabPresetId, intensityPercent: number, seed = 1): PixelBuffer {
  const dimensions = requireSafeDimensions(source.width, source.height, 'processor')
  if (source.data.length !== dimensions.width * dimensions.height * 4) throw new Error('Color Lab image decode failed: invalid processor pixel buffer')
  const output = new Uint8ClampedArray(source.data)
  const intensity = clamp01(intensityPercent / 100)
  if (presetId === 'original' || intensity === 0) return { ...dimensions, data: output }

  const preset = getColorLabPreset(presetId)
  const original = source.data
  const textureSeed = textureSeedFor(seed, presetId)
  const softnessRadius = preset.softness >= 0.24 ? 2 : 1

  for (let pixel = 0; pixel < original.length; pixel += 4) {
    const x = (pixel / 4) % dimensions.width
    const y = Math.floor(pixel / 4 / dimensions.width)
    const r0 = original[pixel]! / 255
    const g0 = original[pixel + 1]! / 255
    const b0 = original[pixel + 2]! / 255
    const sourceLuminance = luminanceOf(r0, g0, b0)

    let r = r0 + (softChannel(original, dimensions.width, dimensions.height, x, y, 0, softnessRadius) - r0) * preset.softness
    let g = g0 + (softChannel(original, dimensions.width, dimensions.height, x, y, 1, softnessRadius) - g0) * preset.softness
    let b = b0 + (softChannel(original, dimensions.width, dimensions.height, x, y, 2, softnessRadius) - b0) * preset.softness

    r = filmTone(r, preset.contrast, preset.blackLift, preset.highlightCompression)
    g = filmTone(g, preset.contrast, preset.blackLift, preset.highlightCompression)
    b = filmTone(b, preset.contrast, preset.blackLift, preset.highlightCompression)
    const tonedLuminance = luminanceOf(r, g, b)
    r = tonedLuminance + (r - tonedLuminance) * preset.saturation
    g = tonedLuminance + (g - tonedLuminance) * preset.saturation
    b = tonedLuminance + (b - tonedLuminance) * preset.saturation

    const shadow = (1 - sourceLuminance) ** 2
    const highlight = sourceLuminance ** 2
    const midtone = Math.max(0, 1 - Math.abs(sourceLuminance * 2 - 1))
    r += preset.shadowBias[0] * shadow + preset.midtoneBias[0] * midtone + preset.highlightBias[0] * highlight
    g += preset.shadowBias[1] * shadow + preset.midtoneBias[1] * midtone + preset.highlightBias[1] * highlight
    b += preset.shadowBias[2] * shadow + preset.midtoneBias[2] * midtone + preset.highlightBias[2] * highlight

    if (presetId === 'red-film') {
      r += 0.12 * midtone + 0.1 * highlight
      g *= 0.7 - highlight * 0.08
      b *= 0.58 - highlight * 0.06
    }

    if (preset.bloomStrength > 0) {
      const [bloomR, bloomG, bloomB] = highlightNeighbour(original, dimensions.width, dimensions.height, x, y, preset.bloomThreshold)
      r += bloomR * (preset.bloomStrength + preset.bloomTint[0])
      g += bloomG * (preset.bloomStrength + preset.bloomTint[1])
      b += bloomB * (preset.bloomStrength + preset.bloomTint[2])
      const haloMask = clamp01((Math.max(bloomR, bloomG, bloomB) - 0.45) / 0.55)
      r += haloMask * preset.halationStrength
      g += haloMask * preset.halationStrength * 0.28
      b -= haloMask * preset.halationStrength * 0.12
    }

    const grainCellX = Math.floor(x / preset.grainSize)
    const grainCellY = Math.floor(y / preset.grainSize)
    const fine = hash(textureSeed + pixel * 13) - 0.5
    const clump = hash(textureSeed + grainCellX * 92821 + grainCellY * 68917) - 0.5
    const grain = (fine * 0.62 + clump * 0.75) * preset.grainStrength * (0.35 + (1 - sourceLuminance) * 0.85)
    r += grain * 1.03; g += grain; b += grain * 0.94

    const dust = hash(textureSeed * 17 + pixel * 7)
    if (dust < preset.dustStrength) {
      const light = hash(textureSeed + pixel * 31) < 0.68 ? 0.42 : -0.3
      r += light; g += light * 0.95; b += light * 0.86
    }
    const scratchColumn = hash(textureSeed * 31 + x * 103) < preset.scratchStrength
    const scratchSegment = hash(textureSeed + Math.floor(y / 9) * 19) < 0.34
    if (scratchColumn && scratchSegment) { r += 0.2; g += 0.18; b += 0.14 }

    output[pixel] = Math.round((r0 + (clamp01(r) - r0) * intensity) * 255)
    output[pixel + 1] = Math.round((g0 + (clamp01(g) - g0) * intensity) * 255)
    output[pixel + 2] = Math.round((b0 + (clamp01(b) - b0) * intensity) * 255)
    output[pixel + 3] = original[pixel + 3]!
  }
  return { ...dimensions, data: output }
}
