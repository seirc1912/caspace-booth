import type { ImageTransform } from '../../types/selfBooth'

export const autoFitZoom = {
  default: 1.5,
  close: 2.2,
} as const

const autoFitTolerance = 0.001

export function createAutoFitZoomUpdate(currentZoom: number): Pick<ImageTransform, 'zoom'> {
  const isClosePreset = Math.abs(currentZoom - autoFitZoom.close) <= autoFitTolerance
  return { zoom: isClosePreset ? autoFitZoom.default : autoFitZoom.close }
}
