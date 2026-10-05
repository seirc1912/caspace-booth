import { getColorLabPreset, type ColorLabPresetId } from './presets'
import { requireSafeDimensions } from './dimensions'

export interface PixelBuffer {
  data: Uint8ClampedArray
  width: number
  height: number
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value))
const hash = (value: number) => {
  let x = value | 0
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b)
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b)
  return ((x ^ (x >>> 16)) >>> 0) / 4294967295
}

function tone(value: number, contrast: number, blackLift: number, compression: number) {
  const lifted = blackLift + value * (1 - blackLift)
  const contrasted = (lifted - 0.5) * contrast + 0.5
  return clamp01(contrasted - compression * Math.max(0, contrasted - 0.68) ** 2 * 1.9)
}

function brightNeighbour(source: Uint8ClampedArray, width: number, height: number, x: number, y: number, channel: number) {
  let total = 0
  let weight = 0
  for (let offsetY = -2; offsetY <= 2; offsetY += 2) {
    for (let offsetX = -2; offsetX <= 2; offsetX += 2) {
      const px = Math.max(0, Math.min(width - 1, x + offsetX))
      const py = Math.max(0, Math.min(height - 1, y + offsetY))
      const index = (py * width + px) * 4
      const luminance = (source[index]! * 0.2126 + source[index + 1]! * 0.7152 + source[index + 2]! * 0.0722) / 255
      const brightness = Math.max(0, luminance - 0.68) / 0.32
      total += (source[index + channel]! / 255) * brightness
      weight += brightness
    }
  }
  return weight ? total / weight : 0
}

export function applyColorLabPreset(source: PixelBuffer, presetId: ColorLabPresetId, intensityPercent: number, seed = 1): PixelBuffer {
  const dimensions = requireSafeDimensions(source.width, source.height, 'processor')
  if (source.data.length !== dimensions.width * dimensions.height * 4) throw new Error('Color Lab image decode failed: invalid processor pixel buffer')
  const output = new Uint8ClampedArray(source.data)
  const intensity = clamp01(intensityPercent / 100)
  if (presetId === 'original' || intensity === 0) return { ...dimensions, data: output }
  const preset = getColorLabPreset(presetId)
  const original = source.data

  for (let pixel = 0; pixel < original.length; pixel += 4) {
    const x = (pixel / 4) % dimensions.width
    const y = Math.floor(pixel / 4 / dimensions.width)
    const r0 = original[pixel]! / 255
    const g0 = original[pixel + 1]! / 255
    const b0 = original[pixel + 2]! / 255
    const luminance = r0 * 0.2126 + g0 * 0.7152 + b0 * 0.0722
    let r = tone(r0, preset.contrast, preset.blackLift, preset.highlightCompression)
    let g = tone(g0, preset.contrast, preset.blackLift, preset.highlightCompression)
    let b = tone(b0, preset.contrast, preset.blackLift, preset.highlightCompression)
    r = luminance + (r - luminance) * preset.saturation
    g = luminance + (g - luminance) * preset.saturation
    b = luminance + (b - luminance) * preset.saturation
    r += preset.temperature * 0.72 + preset.tint * 0.35
    g += preset.temperature * 0.16 - preset.tint * 0.3
    b -= preset.temperature * 0.62 - preset.tint * 0.32
    const highlight = luminance * luminance
    const shadow = (1 - luminance) ** 2
    r += preset.shadowBias[0] * shadow + preset.highlightBias[0] * highlight
    g += preset.shadowBias[1] * shadow + preset.highlightBias[1] * highlight
    b += preset.shadowBias[2] * shadow + preset.highlightBias[2] * highlight

    if (presetId === 'red-film') {
      const redResponse = 0.08 + 0.3 * Math.pow(luminance, 0.72)
      r = clamp01(r + redResponse + g0 * 0.08)
      g = clamp01(g * (0.62 - luminance * 0.12) + luminance * 0.055)
      b = clamp01(b * (0.5 - luminance * 0.1) + shadow * 0.018)
    }

    if (preset.bloom > 0 && luminance > 0.18) {
      const bloomR = brightNeighbour(original, dimensions.width, dimensions.height, x, y, 0)
      const bloomG = brightNeighbour(original, dimensions.width, dimensions.height, x, y, 1)
      const bloomB = brightNeighbour(original, dimensions.width, dimensions.height, x, y, 2)
      r += bloomR * preset.bloom * 0.95
      g += bloomG * preset.bloom * 0.78
      b += bloomB * preset.bloom * 0.58
    }

    const fine = (hash(seed + pixel * 13) - 0.5) * preset.grain
    const coarse = (hash(seed + Math.floor(x / 3) * 37 + Math.floor(y / 3) * 101) - 0.5) * preset.grain * 0.55
    const grain = (fine + coarse) * (0.45 + shadow * 0.7)
    r += grain * 1.05; g += grain; b += grain * 0.92

    if (preset.dust > 0) {
      const dust = hash(seed * 17 + pixel * 7)
      if (dust < preset.dust) {
        const light = dust < preset.dust * 0.72 ? 0.34 : -0.25
        r += light; g += light * 0.94; b += light * 0.82
      }
      const scratch = hash(seed * 31 + x * 103) < preset.dust * 0.08 && hash(seed + y * 19) < 0.16
      if (scratch) { r += 0.18; g += 0.16; b += 0.12 }
    }

    output[pixel] = Math.round((r0 + (clamp01(r) - r0) * intensity) * 255)
    output[pixel + 1] = Math.round((g0 + (clamp01(g) - g0) * intensity) * 255)
    output[pixel + 2] = Math.round((b0 + (clamp01(b) - b0) * intensity) * 255)
    output[pixel + 3] = original[pixel + 3]!
  }
  return { ...dimensions, data: output }
}
