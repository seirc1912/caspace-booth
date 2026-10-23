export function clampAdjustment(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function stepAdjustment(value: number, delta: number, min: number, max: number) {
  return clampAdjustment(Math.round((value + delta) * 100) / 100, min, max)
}

export function adjustmentFromPointer(clientX: number, left: number, width: number, min: number, max: number) {
  if (width <= 0) return clampAdjustment(min, min, max)
  const ratio = Math.min(1, Math.max(0, (clientX - left) / width))
  return Math.round((min + ratio * (max - min)) * 100) / 100
}
