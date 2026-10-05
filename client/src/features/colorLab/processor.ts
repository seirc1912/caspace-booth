import { getColorLabPreset, type ColorLabPresetId } from './presets'
import { requireSafeDimensions } from './dimensions'

export interface PixelBuffer { data: Uint8ClampedArray; width: number; height: number }

const clamp01 = (value: number) => Math.max(0, Math.min(1, value))
const luminanceOf = (r: number, g: number, b: number) => r * 0.2126 + g * 0.7152 + b * 0.0722
const smoothstep = (edge0: number, edge1: number, value: number) => {
  const t = clamp01((value - edge0) / Math.max(0.001, edge1 - edge0))
  return t * t * (3 - 2 * t)
}
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
  const kernel = [
    [0, 0, 4], [-1, 0, 2], [1, 0, 2], [0, -1, 2], [0, 1, 2],
    [-2, 0, 1], [2, 0, 1], [0, -2, 1], [0, 2, 1],
  ] as const
  const kernelWeight = 16
  for (const [offsetX, offsetY, sampleWeight] of kernel) {
    const r = channelAt(source, width, height, x + offsetX, y + offsetY, 0)
    const g = channelAt(source, width, height, x + offsetX, y + offsetY, 1)
    const b = channelAt(source, width, height, x + offsetX, y + offsetY, 2)
    const weightedMask = smoothstep(threshold, Math.min(1, threshold + 0.22), luminanceOf(r, g, b)) * sampleWeight
    total[0] += r * weightedMask; total[1] += g * weightedMask; total[2] += b * weightedMask
  }
  return [total[0]! / kernelWeight, total[1]! / kernelWeight, total[2]! / kernelWeight]
}

function filmTone(value: number, contrast: number, blackLift: number, compression: number) {
  const lifted = blackLift + value * (1 - blackLift)
  const contrasted = (lifted - 0.5) * contrast + 0.5
  const shoulder = Math.max(0, contrasted - 0.58) / 0.42
  return clamp01(contrasted - compression * shoulder * shoulder * 0.24)
}

export interface FilmDust {
  x: number
  y: number
  strength: number
}

export interface FilmScratch {
  x: number
  yStart: number
  yEnd: number
  slope: number
  wobble: number
  phase: number
  opacity: number
  light: boolean
  breakSeed: number
}

function buildDustPlan(count: number, seed: number): FilmDust[] {
  return Array.from({ length: count }, (_, index) => {
    const light = hash(seed + index * 173 + 47) < 0.67
    return {
      x: hash(seed + index * 101 + 11),
      y: hash(seed + index * 137 + 23),
      strength: (light ? 1 : -1) * (0.18 + hash(seed + index * 211 + 71) * 0.22),
    }
  })
}

function materializeDust(width: number, height: number, plan: FilmDust[]) {
  const dust = new Map<number, number>()
  const radius = Math.max(0, Math.round(Math.max(width, height) / 1800) - 1)
  for (const point of plan) {
    const x = Math.min(width - 1, Math.floor(point.x * width))
    const y = Math.min(height - 1, Math.floor(point.y * height))
    for (let offsetY = -radius; offsetY <= radius; offsetY += 1) {
      for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
        const px = x + offsetX; const py = y + offsetY
        if (px >= 0 && px < width && py >= 0 && py < height) dust.set(py * width + px, point.strength)
      }
    }
  }
  return dust
}

export function createFilmDefectPlan(presetId: ColorLabPresetId, seed = 1) {
  const preset = getColorLabPreset(presetId)
  const textureSeed = textureSeedFor(seed, presetId)
  return {
    dust: buildDustPlan(preset.dustCount, textureSeed * 17),
    scratches: buildScratches(preset.scratchMin, preset.scratchMax, preset.scratchOpacity, textureSeed * 31),
  }
}

function buildScratches(minimum: number, maximum: number, opacity: number, seed: number): FilmScratch[] {
  if (maximum <= 0 || opacity <= 0) return []
  const count = minimum + Math.floor(hash(seed + 809) * (maximum - minimum + 1))
  return Array.from({ length: count }, (_, index) => {
    const yStart = 0.03 + hash(seed + index * 251 + 17) * 0.68
    return {
      x: 0.04 + hash(seed + index * 271 + 29) * 0.92,
      yStart,
      yEnd: Math.min(0.98, yStart + 0.2 + hash(seed + index * 293 + 41) * 0.5),
      slope: (hash(seed + index * 307 + 53) - 0.5) * 0.09,
      wobble: 0.0008 + hash(seed + index * 331 + 67) * 0.0022,
      phase: hash(seed + index * 347 + 79) * Math.PI * 2,
      opacity: opacity * (0.45 + hash(seed + index * 359 + 97) * 0.55),
      light: hash(seed + index * 379 + 109) < 0.64,
      breakSeed: seed + index * 397,
    }
  })
}

function scratchAt(scratches: FilmScratch[], x: number, y: number, width: number, height: number) {
  const nx = (x + 0.5) / width
  const ny = (y + 0.5) / height
  const hairlineWidth = Math.max(0.65, width / 1600) / width
  let amount = 0
  for (const scratch of scratches) {
    if (ny < scratch.yStart || ny > scratch.yEnd) continue
    const progress = (ny - scratch.yStart) / Math.max(0.001, scratch.yEnd - scratch.yStart)
    const scratchX = scratch.x + scratch.slope * progress + Math.sin(progress * Math.PI * 5 + scratch.phase) * scratch.wobble
    const distance = Math.abs(nx - scratchX)
    if (distance > hairlineWidth) continue
    if (hash(scratch.breakSeed + Math.floor(progress * 43) * 419) < 0.18) continue
    const edge = 1 - distance / hairlineWidth
    amount += (scratch.light ? 1 : -1) * scratch.opacity * edge
  }
  return amount
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
  const defects = createFilmDefectPlan(presetId, seed)
  const dust = materializeDust(dimensions.width, dimensions.height, defects.dust)
  const scratches = defects.scratches

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

    r = filmTone(r + preset.exposure, preset.contrast, preset.blackLift, preset.highlightCompression)
    g = filmTone(g + preset.exposure, preset.contrast, preset.blackLift, preset.highlightCompression)
    b = filmTone(b + preset.exposure, preset.contrast, preset.blackLift, preset.highlightCompression)
    const tonedLuminance = luminanceOf(r, g, b)
    r = tonedLuminance + (r - tonedLuminance) * preset.saturation
    g = tonedLuminance + (g - tonedLuminance) * preset.saturation
    b = tonedLuminance + (b - tonedLuminance) * preset.saturation
    if (preset.monochrome > 0) {
      const monochrome = luminanceOf(r, g, b)
      r += (monochrome * (1 + preset.monochromeWarmth) - r) * preset.monochrome
      g += (monochrome * (1 + preset.monochromeWarmth * 0.35) - g) * preset.monochrome
      b += (monochrome * (1 - preset.monochromeWarmth) - b) * preset.monochrome
    }

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

    const fine = ((hash(textureSeed + pixel * 13) + hash(textureSeed * 3 + pixel * 29) + hash(textureSeed * 7 + pixel * 47)) / 3) - 0.5
    const microCluster = hash(textureSeed + Math.floor(x / 2) * 92821 + Math.floor(y / 2) * 68917) - 0.5
    const grain = (fine * 1.65 + microCluster * Math.min(0.18, preset.grainSize * 0.07)) * preset.grainStrength * (0.32 + (1 - sourceLuminance) * 0.8)
    r += grain * 1.03; g += grain; b += grain * 0.94

    const dustAmount = dust.get(pixel / 4) ?? 0
    r += dustAmount; g += dustAmount * 0.95; b += dustAmount * 0.86
    const scratchAmount = scratchAt(scratches, x, y, dimensions.width, dimensions.height)
    r += scratchAmount; g += scratchAmount * 0.96; b += scratchAmount * 0.9

    if (preset.vignette > 0) {
      const nx = (x + 0.5) / dimensions.width - 0.5
      const ny = (y + 0.5) / dimensions.height - 0.5
      const edge = smoothstep(0.26, 0.7, Math.hypot(nx, ny)) * preset.vignette
      r -= edge; g -= edge; b -= edge
    }

    output[pixel] = Math.round((r0 + (clamp01(r) - r0) * intensity) * 255)
    output[pixel + 1] = Math.round((g0 + (clamp01(g) - g0) * intensity) * 255)
    output[pixel + 2] = Math.round((b0 + (clamp01(b) - b0) * intensity) * 255)
    output[pixel + 3] = original[pixel + 3]!
  }
  return { ...dimensions, data: output }
}
