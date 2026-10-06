import { getColorLabPreset, type ColorLabPresetId } from './presets'
import { requireSafeDimensions } from './dimensions'

export interface PixelBuffer { data: Uint8ClampedArray; width: number; height: number }

export const COLOR_LAB_RENDER_VERSION = 4
const DEFECT_REFERENCE_WIDTH = 1000
const DEFECT_REFERENCE_AREA = 1_000_000

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
  const versionedId = `${id}:film-engine-${COLOR_LAB_RENDER_VERSION}`
  for (let index = 0; index < versionedId.length; index += 1) result = Math.imul(result ^ versionedId.charCodeAt(index), 16777619)
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
  size: number
  aspect: number
  angle: number
  strength: number
  softness: number
  kind: 'dot' | 'dash' | 'fiber' | 'particle'
  light: boolean
  detailSeed: number
}

export interface FilmScratch {
  x: number
  yStart: number
  yEnd: number
  slope: number
  curve: number
  wobble: number
  phase: number
  width: number
  softness: number
  interruptions: number
  opacity: number
  light: boolean
  breakSeed: number
}

export interface FilmAbrasion {
  x: number
  y: number
  length: number
  angle: number
  curve: number
  width: number
  opacity: number
  light: boolean
  breakSeed: number
}

function buildDustPlan(count: number, seed: number): FilmDust[] {
  return Array.from({ length: count }, (_, index) => {
    const light = hash(seed + index * 173 + 47) < 0.67
    const kindRoll = hash(seed + index * 229 + 83)
    const kind: FilmDust['kind'] = kindRoll < 0.55 ? 'dot' : kindRoll < 0.75 ? 'dash' : kindRoll < 0.9 ? 'fiber' : 'particle'
    const rareLargerParticle = kind === 'particle' && hash(seed + index * 241 + 91) > 0.72
    return {
      x: hash(seed + index * 101 + 11),
      y: hash(seed + index * 137 + 23),
      size: rareLargerParticle ? 2.2 + hash(seed + index * 251 + 97) * 1.4 : 0.55 + hash(seed + index * 251 + 97) * 1.45,
      aspect: kind === 'fiber' ? 2.5 + hash(seed + index * 263 + 103) * 3.5 : kind === 'dash' ? 1.5 + hash(seed + index * 263 + 103) * 1.7 : 0.7 + hash(seed + index * 263 + 103) * 0.6,
      angle: hash(seed + index * 277 + 107) * Math.PI,
      strength: 0.16 + hash(seed + index * 211 + 71) * (rareLargerParticle ? 0.2 : 0.3),
      softness: rareLargerParticle ? 0.55 : hash(seed + index * 281 + 109) * 0.35,
      kind,
      light,
      detailSeed: seed + index * 283,
    }
  })
}

function materializeDust(width: number, height: number, plan: FilmDust[]) {
  const dust = new Map<number, readonly [number, number, number]>()
  const resolutionScale = Math.max(0.35, width / DEFECT_REFERENCE_WIDTH)
  for (const point of plan) {
    const x = Math.min(width - 1, Math.floor(point.x * width))
    const y = Math.min(height - 1, Math.floor(point.y * height))
    const radiusX = Math.max(0.45, point.size * point.aspect * resolutionScale)
    const radiusY = Math.max(0.45, point.size * resolutionScale)
    const extent = Math.ceil(Math.max(radiusX, radiusY) + 1)
    const cosine = Math.cos(point.angle); const sine = Math.sin(point.angle)
    for (let offsetY = -extent; offsetY <= extent; offsetY += 1) {
      for (let offsetX = -extent; offsetX <= extent; offsetX += 1) {
        const px = x + offsetX; const py = y + offsetY
        if (px < 0 || px >= width || py < 0 || py >= height) continue
        const rotatedX = offsetX * cosine + offsetY * sine
        const rotatedY = -offsetX * sine + offsetY * cosine
        const distance = Math.hypot(rotatedX / radiusX, rotatedY / radiusY)
        if (distance > 1 || hash(point.detailSeed + offsetX * 43 + offsetY * 71) < distance * 0.12) continue
        const edge = Math.pow(1 - distance, 0.7 + point.softness * 2.2)
        const signed = (point.light ? 1 : -1) * point.strength * edge
        const tint: readonly [number, number, number] = point.light ? [1, 0.96, 0.84] : [0.78, 0.67, 0.56]
        const key = py * width + px
        const current = dust.get(key) ?? [0, 0, 0]
        dust.set(key, [current[0] + signed * tint[0], current[1] + signed * tint[1], current[2] + signed * tint[2]])
      }
    }
  }
  return dust
}

function dustCountForArea(densityPerMegapixel: number, width: number, height: number) {
  if (densityPerMegapixel <= 0) return 0
  const areaCount = Math.round(densityPerMegapixel * width * height / DEFECT_REFERENCE_AREA)
  const minimumVisibleCount = Math.min(width, height) >= 64 ? Math.ceil(densityPerMegapixel * 0.08) : 0
  return Math.max(minimumVisibleCount, areaCount)
}

export function createFilmDefectPlan(presetId: ColorLabPresetId, seed = 1, width = 1000, height = 1500) {
  const preset = getColorLabPreset(presetId)
  const textureSeed = textureSeedFor(seed, presetId)
  return {
    dust: buildDustPlan(dustCountForArea(preset.dustCount, width, height), textureSeed * 17),
    abrasion: buildAbrasionPlan(dustCountForArea(preset.abrasionDensity, width, height), textureSeed * 23),
    scratches: buildScratches(preset.scratchMin, preset.scratchMax, preset.scratchOpacity, textureSeed * 31),
    fibers: buildFibers(preset.fiberMin, preset.fiberMax, preset.scratchOpacity, textureSeed * 43),
  }
}

function buildAbrasionPlan(count: number, seed: number): FilmAbrasion[] {
  return Array.from({ length: count }, (_, index) => ({
    x: hash(seed + index * 173 + 17),
    y: hash(seed + index * 181 + 29),
    length: 0.003 + hash(seed + index * 191 + 37) * 0.045,
    angle: hash(seed + index * 193 + 41) * Math.PI * 2,
    curve: (hash(seed + index * 197 + 43) - 0.5) * 0.012,
    width: 0.28 + hash(seed + index * 199 + 47) * 0.62,
    opacity: 0.025 + hash(seed + index * 211 + 53) * 0.075,
    light: hash(seed + index * 223 + 59) < 0.72,
    breakSeed: seed + index * 227,
  }))
}

function buildFibers(minimum: number, maximum: number, opacity: number, seed: number): FilmScratch[] {
  if (maximum <= 0 || opacity <= 0) return []
  const count = minimum + Math.floor(hash(seed + 613) * (maximum - minimum + 1))
  return Array.from({ length: count }, (_, index) => {
    const length = 0.12 + hash(seed + index * 229 + 19) * 0.34
    const yStart = 0.03 + hash(seed + index * 233 + 23) * Math.max(0.01, 0.94 - length)
    return {
      x: 0.04 + hash(seed + index * 239 + 31) * 0.92,
      yStart,
      yEnd: yStart + length,
      slope: (hash(seed + index * 241 + 37) - 0.5) * 0.48,
      curve: (hash(seed + index * 251 + 41) - 0.5) * 0.24,
      wobble: 0.003 + hash(seed + index * 257 + 43) * 0.009,
      phase: hash(seed + index * 263 + 47) * Math.PI * 2,
      width: 0.45 + hash(seed + index * 269 + 53) * 0.9,
      softness: 0.35 + hash(seed + index * 271 + 59) * 0.6,
      interruptions: 2 + Math.floor(hash(seed + index * 277 + 61) * 5),
      opacity: opacity * (0.48 + hash(seed + index * 281 + 67) * 0.38),
      light: hash(seed + index * 283 + 71) < 0.58,
      breakSeed: seed + index * 293,
    }
  })
}

function buildScratches(minimum: number, maximum: number, opacity: number, seed: number): FilmScratch[] {
  if (maximum <= 0 || opacity <= 0) return []
  const count = minimum + Math.floor(hash(seed + 809) * (maximum - minimum + 1))
  return Array.from({ length: count }, (_, index) => {
    const longCount = Math.ceil(count * 0.45)
    const mediumCount = Math.ceil(count * 0.3)
    const lengthRoll = hash(seed + index * 293 + 41)
    const length = index < longCount
      ? 0.4 + lengthRoll * 0.55
      : index < longCount + mediumCount ? 0.15 + lengthRoll * 0.25 : 0.03 + lengthRoll * 0.12
    const yStart = 0.02 + hash(seed + index * 251 + 17) * Math.max(0.01, 0.96 - length)
    return {
      x: 0.04 + hash(seed + index * 271 + 29) * 0.92,
      yStart,
      yEnd: Math.min(0.98, yStart + length),
      slope: (hash(seed + index * 307 + 53) - 0.5) * 0.13,
      curve: (hash(seed + index * 317 + 59) - 0.5) * 0.055,
      wobble: 0.0007 + hash(seed + index * 331 + 67) * 0.003,
      phase: hash(seed + index * 347 + 79) * Math.PI * 2,
      width: 0.7 + hash(seed + index * 349 + 89) * 2.1,
      softness: hash(seed + index * 353 + 91),
      interruptions: 1 + Math.floor(hash(seed + index * 357 + 93) * 4),
      opacity: opacity * (0.62 + hash(seed + index * 359 + 97) * 0.58),
      light: hash(seed + index * 379 + 109) < 0.62,
      breakSeed: seed + index * 397,
    }
  })
}

function materializeScratches(width: number, height: number, scratches: FilmScratch[]) {
  const marks = new Map<number, number>()
  for (const scratch of scratches) {
    const firstY = Math.max(0, Math.floor(scratch.yStart * height))
    const lastY = Math.min(height - 1, Math.ceil(scratch.yEnd * height))
    for (let y = firstY; y <= lastY; y += 1) {
      const ny = (y + 0.5) / height
      const progress = (ny - scratch.yStart) / Math.max(0.001, scratch.yEnd - scratch.yStart)
      if (progress < 0 || progress > 1) continue
      const gapCell = Math.floor(progress * (scratch.interruptions * 5 + 8))
      if (hash(scratch.breakSeed + gapCell * 419) < 0.2) continue
      const curvature = scratch.curve * 4 * progress * (1 - progress)
      const normalizedX = scratch.x + scratch.slope * progress + curvature + Math.sin(progress * Math.PI * 5 + scratch.phase) * scratch.wobble
      const centerX = normalizedX * width - 0.5
      const widthVariation = 0.76 + Math.sin(progress * Math.PI * 13 + scratch.phase) * 0.18 + hash(scratch.breakSeed + Math.floor(progress * 67)) * 0.12
      const radius = Math.max(0.3, scratch.width * widthVariation * width / DEFECT_REFERENCE_WIDTH)
      const firstX = Math.max(0, Math.floor(centerX - radius))
      const lastX = Math.min(width - 1, Math.ceil(centerX + radius))
      const taper = Math.min(1, progress * 16, (1 - progress) * 16)
      const opacityVariation = 0.62 + hash(scratch.breakSeed + Math.floor(progress * 97) * 431) * 0.52
      for (let x = firstX; x <= lastX; x += 1) {
        const distance = Math.abs(x + 0.5 - centerX)
        if (distance > radius) continue
        const edge = Math.pow(1 - distance / radius, 1.65 - scratch.softness * 0.9)
        const amount = (scratch.light ? 1 : -1) * scratch.opacity * edge * taper * opacityVariation
        const key = y * width + x
        marks.set(key, (marks.get(key) ?? 0) + amount)
      }
    }
  }
  return marks
}

function materializeAbrasion(width: number, height: number, abrasion: FilmAbrasion[]) {
  const marks = new Map<number, number>()
  for (const stroke of abrasion) {
    const pixelLength = Math.max(1, stroke.length * Math.hypot(width, height))
    const steps = Math.ceil(pixelLength * 1.25)
    for (let step = 0; step <= steps; step += 1) {
      const progress = step / steps
      if (hash(stroke.breakSeed + Math.floor(progress * 17) * 307) < 0.08) continue
      const fade = Math.min(1, progress * 8, (1 - progress) * 8)
      const bend = Math.sin(progress * Math.PI) * stroke.curve
      const nx = stroke.x + Math.cos(stroke.angle) * stroke.length * progress - Math.sin(stroke.angle) * bend
      const ny = stroke.y + Math.sin(stroke.angle) * stroke.length * progress + Math.cos(stroke.angle) * bend
      const centerX = Math.round(nx * width); const centerY = Math.round(ny * height)
      if (centerX < 0 || centerX >= width || centerY < 0 || centerY >= height) continue
      const radius = Math.max(0.22, stroke.width * width / DEFECT_REFERENCE_WIDTH)
      const amount = (stroke.light ? 1 : -1) * stroke.opacity * fade * (0.72 + hash(stroke.breakSeed + step * 311) * 0.4)
      const extent = Math.ceil(radius)
      for (let offsetY = -extent; offsetY <= extent; offsetY += 1) for (let offsetX = -extent; offsetX <= extent; offsetX += 1) {
        const distance = Math.hypot(offsetX, offsetY)
        if (distance > radius) continue
        const px = centerX + offsetX; const py = centerY + offsetY
        if (px < 0 || px >= width || py < 0 || py >= height) continue
        const key = py * width + px
        marks.set(key, (marks.get(key) ?? 0) + amount * Math.max(0.15, 1 - distance / radius))
      }
    }
  }
  return marks
}

function compositeDefect(channel: number, amount: number) {
  return amount >= 0 ? channel + (1 - channel) * amount : channel + channel * amount
}

export function createFilmDefectRaster(width: number, height: number, presetId: ColorLabPresetId, seed = 1) {
  const dimensions = requireSafeDimensions(width, height, 'defect raster')
  const plan = createFilmDefectPlan(presetId, seed, dimensions.width, dimensions.height)
  return {
    plan,
    dust: materializeDust(dimensions.width, dimensions.height, plan.dust),
    abrasion: materializeAbrasion(dimensions.width, dimensions.height, plan.abrasion),
    scratches: materializeScratches(dimensions.width, dimensions.height, plan.scratches),
    fibers: materializeScratches(dimensions.width, dimensions.height, plan.fibers),
  }
}

export function renderFilmImage(source: PixelBuffer, presetId: ColorLabPresetId, intensityPercent: number, seed = 1): PixelBuffer {
  const dimensions = requireSafeDimensions(source.width, source.height, 'processor')
  if (source.data.length !== dimensions.width * dimensions.height * 4) throw new Error('Color Lab image decode failed: invalid processor pixel buffer')
  const output = new Uint8ClampedArray(source.data)
  const intensity = clamp01(intensityPercent / 100)
  if (presetId === 'original' || intensity === 0) return { ...dimensions, data: output }

  const preset = getColorLabPreset(presetId)
  const original = source.data
  const textureSeed = textureSeedFor(seed, presetId)
  const softnessRadius = preset.softness >= 0.24 ? 2 : 1
  const defects = createFilmDefectRaster(dimensions.width, dimensions.height, presetId, seed)
  const dust = defects.dust
  const abrasion = defects.abrasion
  const scratches = defects.scratches
  const fibers = defects.fibers

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

    const dustAmount = dust.get(pixel / 4) ?? [0, 0, 0]
    r = compositeDefect(r, dustAmount[0]); g = compositeDefect(g, dustAmount[1]); b = compositeDefect(b, dustAmount[2])
    const scratchAmount = scratches.get(pixel / 4) ?? 0
    const abrasionAmount = abrasion.get(pixel / 4) ?? 0
    const fiberAmount = fibers.get(pixel / 4) ?? 0
    const physicalMark = scratchAmount + abrasionAmount + fiberAmount
    r = compositeDefect(r, physicalMark)
    g = compositeDefect(g, physicalMark * 0.96)
    b = compositeDefect(b, physicalMark * 0.88)

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

export const applyColorLabPreset = renderFilmImage
