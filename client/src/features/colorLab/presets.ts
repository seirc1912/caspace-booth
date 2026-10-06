export type ColorLabPresetId = 'original' | 'bw-instant' | 'dark-instant' | 'flash-90s' | 'golden-vintage' | 'greenish-film' | 'faded-brown' | 'expired-film' | 'burnt-film'

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
  vignette: number
  burnStrength: number
}

const clean: Omit<ColorLabPreset, 'id' | 'name' | 'description'> = {
  contrast: 1, exposure: 0, saturation: 1, monochrome: 0, monochromeWarmth: 0, blackLift: 0, highlightCompression: 0,
  shadowBias: [0, 0, 0], midtoneBias: [0, 0, 0], highlightBias: [0, 0, 0], softness: 0,
  bloomStrength: 0, bloomThreshold: 1, bloomTint: [0, 0, 0], halationStrength: 0,
  vignette: 0, burnStrength: 0,
}

export const colorLabPresets: readonly ColorLabPreset[] = [
  { ...clean, id: 'original', name: 'Original', description: 'Your untouched photo' },
  { ...clean, id: 'bw-instant', name: 'B&W Instant', description: 'Old monochrome instant film', contrast: 1.18, saturation: 0, monochrome: 1, monochromeWarmth: 0.006, blackLift: 0.035, highlightCompression: 0.24, shadowBias: [-0.008, -0.008, -0.008], midtoneBias: [0.007, 0.007, 0.007], highlightBias: [0.018, 0.018, 0.018], softness: 0.14, bloomStrength: 0.025, bloomThreshold: 0.76, bloomTint: [0.007, 0.007, 0.007], vignette: 0.018 },
  { ...clean, id: 'dark-instant', name: 'Dark Instant', description: 'Moody green-shadow instant', contrast: 1.12, exposure: -0.075, saturation: 0.76, blackLift: 0.022, highlightCompression: 0.23, shadowBias: [-0.035, 0.035, 0.025], midtoneBias: [0.022, 0.008, -0.008], highlightBias: [0.045, 0.035, 0.02], softness: 0.12, bloomStrength: 0.022, bloomThreshold: 0.78, bloomTint: [0.008, 0.012, 0.004], halationStrength: 0.012, vignette: 0.055 },
  { ...clean, id: 'flash-90s', name: 'Flash 90s', description: 'Cool direct-flash snapshot', contrast: 1.2, exposure: 0.025, saturation: 0.92, blackLift: 0.012, highlightCompression: 0.17, shadowBias: [-0.045, 0.018, 0.06], midtoneBias: [0.018, 0, 0.014], highlightBias: [0.018, 0.025, 0.045], softness: 0.045, bloomStrength: 0.018, bloomThreshold: 0.82, bloomTint: [0, 0.008, 0.018], halationStrength: 0.006, vignette: 0.015 },
  { ...clean, id: 'golden-vintage', name: 'Golden Vintage', description: 'Strong aged golden film', contrast: 1.08, exposure: -0.015, saturation: 0.94, blackLift: 0.045, highlightCompression: 0.26, shadowBias: [0.045, 0.025, -0.04], midtoneBias: [0.13, 0.075, -0.045], highlightBias: [0.16, 0.105, -0.035], softness: 0.15, bloomStrength: 0.055, bloomThreshold: 0.7, bloomTint: [0.055, 0.032, -0.008], halationStrength: 0.035, vignette: 0.045 },
  { ...clean, id: 'greenish-film', name: 'Greenish Film', description: 'Aged cyan-shadow consumer film', contrast: 1.02, saturation: 0.82, blackLift: 0.065, highlightCompression: 0.22, shadowBias: [-0.06, 0.065, 0.045], midtoneBias: [0.025, 0.012, -0.012], highlightBias: [0.075, 0.06, 0.015], softness: 0.13, bloomStrength: 0.04, bloomThreshold: 0.73, bloomTint: [0.02, 0.026, 0.004], halationStrength: 0.014, vignette: 0.025 },
  { ...clean, id: 'faded-brown', name: 'Faded Brown', description: 'Warm faded family print', contrast: 0.84, exposure: 0.005, saturation: 0.69, blackLift: 0.105, highlightCompression: 0.31, shadowBias: [0.028, 0.025, -0.018], midtoneBias: [0.045, 0.025, -0.018], highlightBias: [0.075, 0.058, 0.026], softness: 0.17, bloomStrength: 0.032, bloomThreshold: 0.74, bloomTint: [0.025, 0.018, 0.004], halationStrength: 0.012, vignette: 0.025 },
  { ...clean, id: 'expired-film', name: 'Expired Film', description: 'Aged color crossover film', contrast: 0.88, exposure: 0.005, saturation: 0.78, blackLift: 0.09, highlightCompression: 0.32, shadowBias: [-0.052, 0.052, 0.035], midtoneBias: [0.052, -0.018, 0.034], highlightBias: [0.065, 0.052, 0.025], softness: 0.15, bloomStrength: 0.038, bloomThreshold: 0.72, bloomTint: [0.025, 0.018, 0.006], halationStrength: 0.015, vignette: 0.022 },
  { ...clean, id: 'burnt-film', name: 'Burnt Film', description: 'Vertical analog light leaks', contrast: 0.94, exposure: 0.002, saturation: 0.94, blackLift: 0.055, highlightCompression: 0.32, shadowBias: [0.015, 0.004, -0.012], midtoneBias: [0.018, 0.006, -0.01], highlightBias: [0.025, 0.018, 0.002], softness: 0.11, bloomStrength: 0.026, bloomThreshold: 0.73, bloomTint: [0.018, 0.008, -0.003], halationStrength: 0.02, vignette: 0.012, burnStrength: 0.92 },
] as const

export function getColorLabPreset(id: ColorLabPresetId) {
  return colorLabPresets.find((preset) => preset.id === id) ?? colorLabPresets[0]!
}
