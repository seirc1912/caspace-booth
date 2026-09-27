import type { ImageTransform } from '../../types/selfBooth'

export const autoFitZoom = {
  default: 1.5,
  close: 2.3,
  wide: 1.02,
} as const

const autoFitTolerance = 0.001

export function createAutoFitZoomUpdate(currentZoom: number): Pick<ImageTransform, 'zoom'> {
  const isClosePreset = Math.abs(currentZoom - autoFitZoom.close) <= autoFitTolerance
  const isWidePreset = Math.abs(currentZoom - autoFitZoom.wide) <= autoFitTolerance
  if (isClosePreset) return { zoom: autoFitZoom.wide }
  if (isWidePreset) return { zoom: autoFitZoom.default }
  return { zoom: autoFitZoom.close }
}
