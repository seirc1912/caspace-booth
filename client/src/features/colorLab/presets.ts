export type ColorLabPresetId = 'original' | 'bw-instant' | 'dark-instant' | 'flash-90s' | 'cream-instant' | 'golden-vintage' | 'greenish-film' | 'pink-instant' | 'muted-retro' | 'red-film' | 'dreamy-dust'

type RgbBias = readonly [number, number, number]

export interface ColorLabPreset {
  id: ColorLabPresetId
  name: string
  description: string
  contrast: number
  exposure: number
  saturation: number
  monochrome: number
  monochromeWarmth: number
  blackLift: number
  highlightCompression: number
  shadowBias: RgbBias
  midtoneBias: RgbBias
  highlightBias: RgbBias
  softness: number
  bloomStrength: number
  bloomThreshold: number
  bloomTint: RgbBias
  halationStrength: number
  grainStrength: number
  grainSize: number
  dustCount: number
  abrasionDensity: number
  scratchMin: number
  scratchMax: number
  scratchOpacity: number
  fiberMin: number
  fiberMax: number
  vignette: number
}

const clean: Omit<ColorLabPreset, 'id' | 'name' | 'description'> = {
  contrast: 1, exposure: 0, saturation: 1, monochrome: 0, monochromeWarmth: 0, blackLift: 0, highlightCompression: 0,
  shadowBias: [0, 0, 0], midtoneBias: [0, 0, 0], highlightBias: [0, 0, 0], softness: 0,
  bloomStrength: 0, bloomThreshold: 1, bloomTint: [0, 0, 0], halationStrength: 0,
  grainStrength: 0, grainSize: 1, dustCount: 0, abrasionDensity: 0, scratchMin: 0, scratchMax: 0, scratchOpacity: 0, fiberMin: 0, fiberMax: 0, vignette: 0,
}

export const colorLabPresets: readonly ColorLabPreset[] = [
  { ...clean, id: 'original', name: 'Original', description: 'Your untouched photo' },
  { ...clean, id: 'bw-instant', name: 'B&W Instant', description: 'Old monochrome instant film', contrast: 1.18, saturation: 0, monochrome: 1, monochromeWarmth: 0.006, blackLift: 0.035, highlightCompression: 0.24, shadowBias: [-0.008, -0.008, -0.008], midtoneBias: [0.007, 0.007, 0.007], highlightBias: [0.018, 0.018, 0.018], softness: 0.14, bloomStrength: 0.025, bloomThreshold: 0.76, bloomTint: [0.007, 0.007, 0.007], grainStrength: 0.052, grainSize: 1.25, dustCount: 300, abrasionDensity: 240, scratchMin: 3, scratchMax: 6, scratchOpacity: 0.14, fiberMin: 1, fiberMax: 2, vignette: 0.018 },
  { ...clean, id: 'dark-instant', name: 'Dark Instant', description: 'Moody green-shadow instant', contrast: 1.12, exposure: -0.075, saturation: 0.76, blackLift: 0.022, highlightCompression: 0.23, shadowBias: [-0.035, 0.035, 0.025], midtoneBias: [0.022, 0.008, -0.008], highlightBias: [0.045, 0.035, 0.02], softness: 0.12, bloomStrength: 0.022, bloomThreshold: 0.78, bloomTint: [0.008, 0.012, 0.004], halationStrength: 0.012, grainStrength: 0.052, grainSize: 1.5, dustCount: 240, abrasionDensity: 180, scratchMin: 2, scratchMax: 4, scratchOpacity: 0.13, fiberMin: 0, fiberMax: 1, vignette: 0.055 },
  { ...clean, id: 'flash-90s', name: 'Flash 90s', description: 'Cool direct-flash snapshot', contrast: 1.2, exposure: 0.025, saturation: 0.92, blackLift: 0.012, highlightCompression: 0.17, shadowBias: [-0.045, 0.018, 0.06], midtoneBias: [0.018, 0, 0.014], highlightBias: [0.018, 0.025, 0.045], softness: 0.045, bloomStrength: 0.018, bloomThreshold: 0.82, bloomTint: [0, 0.008, 0.018], halationStrength: 0.006, grainStrength: 0.043, grainSize: 1.1, dustCount: 140, abrasionDensity: 120, scratchMin: 1, scratchMax: 3, scratchOpacity: 0.11, vignette: 0.015 },
  { ...clean, id: 'cream-instant', name: 'Cream Instant', description: 'Soft pastel instant photo', contrast: 0.76, exposure: 0.018, saturation: 0.7, blackLift: 0.14, highlightCompression: 0.34, shadowBias: [0.018, 0.018, 0.02], midtoneBias: [0.035, 0.028, 0.018], highlightBias: [0.085, 0.075, 0.055], softness: 0.24, bloomStrength: 0.07, bloomThreshold: 0.67, bloomTint: [0.035, 0.028, 0.018], halationStrength: 0.012, grainStrength: 0.038, grainSize: 1.35, dustCount: 180, abrasionDensity: 150, scratchMin: 2, scratchMax: 4, scratchOpacity: 0.12, fiberMin: 0, fiberMax: 1, vignette: 0.012 },
  { ...clean, id: 'golden-vintage', name: 'Golden Vintage', description: 'Strong aged golden film', contrast: 1.08, exposure: -0.015, saturation: 0.94, blackLift: 0.045, highlightCompression: 0.26, shadowBias: [0.045, 0.025, -0.04], midtoneBias: [0.13, 0.075, -0.045], highlightBias: [0.16, 0.105, -0.035], softness: 0.15, bloomStrength: 0.055, bloomThreshold: 0.7, bloomTint: [0.055, 0.032, -0.008], halationStrength: 0.035, grainStrength: 0.068, grainSize: 1.9, dustCount: 550, abrasionDensity: 430, scratchMin: 4, scratchMax: 7, scratchOpacity: 0.17, fiberMin: 1, fiberMax: 2, vignette: 0.045 },
  { ...clean, id: 'greenish-film', name: 'Greenish Film', description: 'Aged cyan-shadow consumer film', contrast: 1.02, saturation: 0.82, blackLift: 0.065, highlightCompression: 0.22, shadowBias: [-0.06, 0.065, 0.045], midtoneBias: [0.025, 0.012, -0.012], highlightBias: [0.075, 0.06, 0.015], softness: 0.13, bloomStrength: 0.04, bloomThreshold: 0.73, bloomTint: [0.02, 0.026, 0.004], halationStrength: 0.014, grainStrength: 0.052, grainSize: 1.5, dustCount: 280, abrasionDensity: 220, scratchMin: 3, scratchMax: 5, scratchOpacity: 0.14, fiberMin: 1, fiberMax: 2, vignette: 0.025 },
  { ...clean, id: 'pink-instant', name: 'Pink Instant', description: 'Rosy instant-film portrait', contrast: 0.86, saturation: 0.88, blackLift: 0.085, highlightCompression: 0.26, shadowBias: [0.028, -0.015, 0.018], midtoneBias: [0.075, -0.012, 0.045], highlightBias: [0.11, -0.008, 0.08], softness: 0.18, bloomStrength: 0.058, bloomThreshold: 0.7, bloomTint: [0.045, -0.004, 0.035], halationStrength: 0.018, grainStrength: 0.045, grainSize: 1.4, dustCount: 220, abrasionDensity: 170, scratchMin: 2, scratchMax: 4, scratchOpacity: 0.13, fiberMin: 0, fiberMax: 1, vignette: 0.018 },
  { ...clean, id: 'muted-retro', name: 'Muted Retro', description: 'Understated faded snapshot', contrast: 0.79, saturation: 0.58, blackLift: 0.11, highlightCompression: 0.29, shadowBias: [0.012, 0.025, 0.002], midtoneBias: [0.025, 0.016, 0.004], highlightBias: [0.07, 0.058, 0.035], softness: 0.22, bloomStrength: 0.035, bloomThreshold: 0.72, bloomTint: [0.025, 0.02, 0.01], halationStrength: 0.01, grainStrength: 0.048, grainSize: 1.6, dustCount: 400, abrasionDensity: 330, scratchMin: 4, scratchMax: 7, scratchOpacity: 0.16, fiberMin: 1, fiberMax: 2, vignette: 0.03 },
  { ...clean, id: 'red-film', name: 'Red Film', description: 'Reactive red analog film', contrast: 1.1, exposure: -0.015, saturation: 1.02, blackLift: 0.012, highlightCompression: 0.31, shadowBias: [0.04, -0.055, -0.065], midtoneBias: [0.17, -0.08, -0.09], highlightBias: [0.22, -0.055, -0.075], softness: 0.14, bloomStrength: 0.065, bloomThreshold: 0.69, bloomTint: [0.075, -0.012, -0.018], halationStrength: 0.09, grainStrength: 0.075, grainSize: 2.1, dustCount: 350, abrasionDensity: 280, scratchMin: 3, scratchMax: 6, scratchOpacity: 0.17, fiberMin: 1, fiberMax: 2, vignette: 0.035 },
  { ...clean, id: 'dreamy-dust', name: 'Dreamy Dust', description: 'Soft aged instant print', contrast: 0.74, exposure: 0.01, saturation: 0.76, blackLift: 0.13, highlightCompression: 0.4, shadowBias: [0.018, 0.014, 0.018], midtoneBias: [0.055, 0.035, 0.012], highlightBias: [0.13, 0.085, 0.038], softness: 0.32, bloomStrength: 0.145, bloomThreshold: 0.59, bloomTint: [0.065, 0.038, 0.014], halationStrength: 0.08, grainStrength: 0.1, grainSize: 2.35, dustCount: 850, abrasionDensity: 560, scratchMin: 8, scratchMax: 14, scratchOpacity: 0.22, fiberMin: 2, fiberMax: 4, vignette: 0.04 },
] as const

export function getColorLabPreset(id: ColorLabPresetId) {
  return colorLabPresets.find((preset) => preset.id === id) ?? colorLabPresets[0]!
}
