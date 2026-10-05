export type ColorLabPresetId = 'original' | 'classic-600' | 'sx70-warm' | 'cold-flash' | 'golden-fade' | 'pink-fade' | 'green-600' | 'milk-fade' | 'red-film' | 'dreamy-dust'

type RgbBias = readonly [number, number, number]

export interface ColorLabPreset {
  id: ColorLabPresetId
  name: string
  description: string
  contrast: number
  saturation: number
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
  dustStrength: number
  scratchStrength: number
}

export const colorLabPresets: readonly ColorLabPreset[] = [
  { id: 'original', name: 'Original', description: 'Your untouched photo', contrast: 1, saturation: 1, blackLift: 0, highlightCompression: 0, shadowBias: [0, 0, 0], midtoneBias: [0, 0, 0], highlightBias: [0, 0, 0], softness: 0, bloomStrength: 0, bloomThreshold: 1, bloomTint: [0, 0, 0], halationStrength: 0, grainStrength: 0, grainSize: 1, dustStrength: 0, scratchStrength: 0 },
  { id: 'classic-600', name: 'Classic 600', description: 'Vintage instant flash', contrast: 1.06, saturation: 0.94, blackLift: 0.045, highlightCompression: 0.19, shadowBias: [-0.025, 0.022, 0.035], midtoneBias: [0.028, 0.008, -0.008], highlightBias: [0.05, 0.005, 0.025], softness: 0.12, bloomStrength: 0.055, bloomThreshold: 0.7, bloomTint: [0.025, 0.012, 0.006], halationStrength: 0.025, grainStrength: 0.042, grainSize: 1.35, dustStrength: 0.00015, scratchStrength: 0.000015 },
  { id: 'sx70-warm', name: 'SX-70 Warm', description: 'Creamy nostalgic warmth', contrast: 0.91, saturation: 0.9, blackLift: 0.07, highlightCompression: 0.28, shadowBias: [0.018, 0.005, 0.018], midtoneBias: [0.065, 0.028, 0.002], highlightBias: [0.075, 0.038, 0.05], softness: 0.2, bloomStrength: 0.075, bloomThreshold: 0.66, bloomTint: [0.035, 0.016, 0.018], halationStrength: 0.025, grainStrength: 0.04, grainSize: 1.6, dustStrength: 0.00015, scratchStrength: 0.000015 },
  { id: 'cold-flash', name: 'Cold Flash', description: 'Crisp blue instant flash', contrast: 1.13, saturation: 0.9, blackLift: 0.025, highlightCompression: 0.14, shadowBias: [-0.045, 0.005, 0.07], midtoneBias: [-0.018, 0.012, 0.035], highlightBias: [-0.01, 0.018, 0.055], softness: 0.065, bloomStrength: 0.028, bloomThreshold: 0.78, bloomTint: [-0.004, 0.01, 0.02], halationStrength: 0.008, grainStrength: 0.038, grainSize: 1.15, dustStrength: 0.0001, scratchStrength: 0.00001 },
  { id: 'golden-fade', name: 'Golden Fade', description: 'Aged warm instant print', contrast: 0.86, saturation: 0.83, blackLift: 0.09, highlightCompression: 0.25, shadowBias: [0.025, 0.01, -0.02], midtoneBias: [0.08, 0.045, -0.025], highlightBias: [0.095, 0.062, -0.018], softness: 0.18, bloomStrength: 0.065, bloomThreshold: 0.68, bloomTint: [0.045, 0.025, -0.005], halationStrength: 0.025, grainStrength: 0.046, grainSize: 1.7, dustStrength: 0.0002, scratchStrength: 0.00002 },
  { id: 'pink-fade', name: 'Pink Fade', description: 'Rosy faded instant film', contrast: 0.86, saturation: 0.88, blackLift: 0.085, highlightCompression: 0.24, shadowBias: [0.025, -0.01, 0.018], midtoneBias: [0.055, -0.012, 0.035], highlightBias: [0.09, -0.018, 0.07], softness: 0.17, bloomStrength: 0.06, bloomThreshold: 0.69, bloomTint: [0.04, -0.006, 0.034], halationStrength: 0.018, grainStrength: 0.043, grainSize: 1.55, dustStrength: 0.00018, scratchStrength: 0.000015 },
  { id: 'green-600', name: 'Green 600', description: 'Experimental instant chemistry', contrast: 1.02, saturation: 0.89, blackLift: 0.055, highlightCompression: 0.19, shadowBias: [-0.055, 0.055, 0.035], midtoneBias: [0.025, 0.022, -0.012], highlightBias: [0.065, 0.038, -0.008], softness: 0.12, bloomStrength: 0.05, bloomThreshold: 0.71, bloomTint: [0.02, 0.024, 0], halationStrength: 0.015, grainStrength: 0.045, grainSize: 1.45, dustStrength: 0.00015, scratchStrength: 0.000015 },
  { id: 'milk-fade', name: 'Milk Fade', description: 'Creamy pastel print', contrast: 0.72, saturation: 0.72, blackLift: 0.145, highlightCompression: 0.32, shadowBias: [0.03, 0.025, 0.03], midtoneBias: [0.035, 0.03, 0.025], highlightBias: [0.075, 0.07, 0.06], softness: 0.25, bloomStrength: 0.085, bloomThreshold: 0.64, bloomTint: [0.035, 0.03, 0.024], halationStrength: 0.012, grainStrength: 0.038, grainSize: 1.55, dustStrength: 0.00012, scratchStrength: 0.00001 },
  { id: 'red-film', name: 'Red Film', description: 'Reactive red analog film', contrast: 1.08, saturation: 1.03, blackLift: 0.018, highlightCompression: 0.3, shadowBias: [0.035, -0.05, -0.06], midtoneBias: [0.15, -0.07, -0.08], highlightBias: [0.2, -0.055, -0.075], softness: 0.16, bloomStrength: 0.075, bloomThreshold: 0.67, bloomTint: [0.075, -0.012, -0.018], halationStrength: 0.095, grainStrength: 0.07, grainSize: 2.2, dustStrength: 0.00055, scratchStrength: 0.00008 },
  { id: 'dreamy-dust', name: 'Dreamy Dust', description: 'Aged photobooth glow', contrast: 0.78, saturation: 0.8, blackLift: 0.12, highlightCompression: 0.38, shadowBias: [0.025, 0.012, 0.018], midtoneBias: [0.06, 0.035, 0.005], highlightBias: [0.12, 0.075, 0.025], softness: 0.32, bloomStrength: 0.15, bloomThreshold: 0.57, bloomTint: [0.065, 0.035, 0.012], halationStrength: 0.085, grainStrength: 0.082, grainSize: 2.45, dustStrength: 0.0007, scratchStrength: 0.00018 },
] as const

export function getColorLabPreset(id: ColorLabPresetId) {
  return colorLabPresets.find((preset) => preset.id === id) ?? colorLabPresets[0]!
}
