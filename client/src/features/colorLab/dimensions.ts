export interface SafeDimensions {
  width: number
  height: number
}

export function requireSafeDimensions(width: unknown, height: unknown, stage: string): SafeDimensions {
  if (typeof width !== 'number' || typeof height !== 'number' || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error(`Color Lab image decode failed: invalid ${stage} dimensions`)
  }
  const safeWidth = Math.round(width)
  const safeHeight = Math.round(height)
  if (!Number.isSafeInteger(safeWidth) || !Number.isSafeInteger(safeHeight) || safeWidth <= 0 || safeHeight <= 0 || safeWidth > 2_147_483_647 || safeHeight > 2_147_483_647) {
    throw new Error(`Color Lab image decode failed: invalid ${stage} dimensions`)
  }
  return { width: safeWidth, height: safeHeight }
}

export function fitColorLabDimensions(width: unknown, height: unknown, maxEdge?: unknown, stage = 'canvas'): SafeDimensions {
  const source = requireSafeDimensions(width, height, `${stage} source`)
  const requestedMaxEdge = maxEdge === undefined ? Math.max(source.width, source.height) : maxEdge
  if (typeof requestedMaxEdge !== 'number' || !Number.isFinite(requestedMaxEdge) || requestedMaxEdge <= 0) {
    throw new Error(`Color Lab image decode failed: invalid ${stage} limit`)
  }
  const scale = Math.min(1, requestedMaxEdge / Math.max(source.width, source.height))
  if (!Number.isFinite(scale) || scale <= 0) throw new Error(`Color Lab image decode failed: invalid ${stage} scale`)
  return requireSafeDimensions(source.width * scale, source.height * scale, stage)
}
