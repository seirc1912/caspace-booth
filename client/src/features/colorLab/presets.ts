export type ColorLabPresetId = 'original' | 'classic-600' | 'sx70-warm' | 'cold-flash' | 'golden-fade' | 'pink-fade' | 'green-600' | 'milk-fade' | 'red-film' | 'dreamy-dust'

export interface ColorLabPreset {
  id: ColorLabPresetId
  name: string
  description: string
  contrast: number
  saturation: number
  blackLift: number
  highlightCompression: number
  temperature: number
  tint: number
  shadowBias: readonly [number, number, number]
  highlightBias: readonly [number, number, number]
  grain: number
  bloom: number
  dust: number
}

export const colorLabPresets: readonly ColorLabPreset[] = [
  { id: 'original', name: 'Original', description: 'Your untouched photo', contrast: 1, saturation: 1, blackLift: 0, highlightCompression: 0, temperature: 0, tint: 0, shadowBias: [0, 0, 0], highlightBias: [0, 0, 0], grain: 0, bloom: 0, dust: 0 },
  { id: 'classic-600', name: 'Classic 600', description: 'Warm skin, cyan shadows', contrast: 1.08, saturation: 0.96, blackLift: 0.035, highlightCompression: 0.12, temperature: 0.035, tint: 0.02, shadowBias: [-0.025, 0.025, 0.035], highlightBias: [0.035, -0.005, 0.018], grain: 0.018, bloom: 0, dust: 0 },
  { id: 'sx70-warm', name: 'SX-70 Warm', description: 'Creamy nostalgic warmth', contrast: 0.96, saturation: 0.94, blackLift: 0.055, highlightCompression: 0.18, temperature: 0.085, tint: 0.025, shadowBias: [0.015, 0, 0.015], highlightBias: [0.07, 0.025, 0.025], grain: 0.016, bloom: 0.025, dust: 0 },
  { id: 'cold-flash', name: 'Cold Flash', description: 'Bright flash and cyan air', contrast: 1.14, saturation: 0.92, blackLift: 0.018, highlightCompression: 0.07, temperature: -0.075, tint: -0.018, shadowBias: [-0.045, 0.015, 0.075], highlightBias: [-0.015, 0.025, 0.065], grain: 0.014, bloom: 0.018, dust: 0 },
  { id: 'golden-fade', name: 'Golden Fade', description: 'Sun-washed vintage gold', contrast: 0.92, saturation: 0.86, blackLift: 0.07, highlightCompression: 0.16, temperature: 0.105, tint: -0.008, shadowBias: [0.02, 0.005, -0.02], highlightBias: [0.085, 0.045, -0.025], grain: 0.019, bloom: 0.018, dust: 0 },
  { id: 'pink-fade', name: 'Pink Fade', description: 'Rosy highlights and soft blacks', contrast: 0.9, saturation: 0.91, blackLift: 0.075, highlightCompression: 0.15, temperature: 0.025, tint: 0.085, shadowBias: [0.02, -0.015, 0.025], highlightBias: [0.08, -0.025, 0.06], grain: 0.016, bloom: 0.018, dust: 0 },
  { id: 'green-600', name: 'Green 600', description: 'Teal shadows, warm faces', contrast: 1.08, saturation: 0.92, blackLift: 0.045, highlightCompression: 0.11, temperature: 0.025, tint: -0.035, shadowBias: [-0.055, 0.06, 0.035], highlightBias: [0.055, 0.025, -0.01], grain: 0.019, bloom: 0, dust: 0 },
  { id: 'milk-fade', name: 'Milk Fade', description: 'Creamy pastel print', contrast: 0.82, saturation: 0.78, blackLift: 0.11, highlightCompression: 0.22, temperature: 0.035, tint: 0.012, shadowBias: [0.025, 0.02, 0.025], highlightBias: [0.06, 0.055, 0.045], grain: 0.013, bloom: 0.035, dust: 0 },
  { id: 'red-film', name: 'Red Film', description: 'Bold reactive red film', contrast: 1.13, saturation: 1.08, blackLift: 0.025, highlightCompression: 0.08, temperature: 0.12, tint: 0.09, shadowBias: [0.045, -0.045, -0.055], highlightBias: [0.16, -0.055, -0.08], grain: 0.033, bloom: 0.012, dust: 0.002 },
  { id: 'dreamy-dust', name: 'Dreamy Dust', description: 'Glow, grain and analog dust', contrast: 0.88, saturation: 0.86, blackLift: 0.09, highlightCompression: 0.2, temperature: 0.07, tint: 0.02, shadowBias: [0.018, 0.008, 0.02], highlightBias: [0.09, 0.055, 0.015], grain: 0.04, bloom: 0.13, dust: 0.007 },
] as const

export function getColorLabPreset(id: ColorLabPresetId) {
  return colorLabPresets.find((preset) => preset.id === id) ?? colorLabPresets[0]!
}
