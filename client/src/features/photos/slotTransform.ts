import type { SlotTransform } from '../../types/selfBooth'

export interface Size { width: number; height: number }
export type QuarterTurn = SlotTransform['rotation']

/** 1 = the photo just covers the slot ("cover"); customers can zoom up to 3×. */
export const MIN_SLOT_SCALE = 1
export const MAX_SLOT_SCALE = 3
export const SLOT_SCALE_STEP = 0.25
/** Below this many original pixels per printed inch the editor warns "ảnh in có thể bị mờ" (waiting for the print counter to confirm). */
export const PRINT_WARNING_DPI = 150
/** Template canvases are designed at this resolution when the print size is unknown. */
export const DEFAULT_TEMPLATE_DPI = 300
/** "Tự xếp" / "Vừa ô" without a detected face: portraits keep the upper part (~20% above centre). */
export const PORTRAIT_FOCUS = { x: 0.5, y: 0.4 }

export function createSlotTransform(grayscale = false): SlotTransform {
  return { scale: 1, offsetX: 0, offsetY: 0, rotation: 0, flipX: false, grayscale }
}

const validSize = (size: Size) => Number.isFinite(size.width) && Number.isFinite(size.height) && size.width > 0 && size.height > 0

/** The photo's bounding size once rotated by a quarter turn. */
export function rotatedSize(photo: Size, rotation: number): Size {
  return Math.abs(rotation) % 180 === 90 ? { width: photo.height, height: photo.width } : photo
}

/** Scale (slot px per photo px) at which the rotated photo just covers the slot. Shared by screen and print. */
export function computeCover(photoW: number, photoH: number, slotW: number, slotH: number, rotation: number = 0) {
  if (!validSize({ width: photoW, height: photoH }) || !validSize({ width: slotW, height: slotH })) throw new Error('Photo and slot dimensions must be positive finite numbers.')
  const rotated = rotatedSize({ width: photoW, height: photoH }, rotation)
  return Math.max(slotW / rotated.width, slotH / rotated.height)
}

export function clampScale(scale: number) {
  return Number.isFinite(scale) ? Math.min(MAX_SLOT_SCALE, Math.max(MIN_SLOT_SCALE, scale)) : MIN_SLOT_SCALE
}

export const normalizeQuarterTurn = (degrees: number): QuarterTurn => ((((Math.round((Number.isFinite(degrees) ? degrees : 0) / 90) * 90) % 360) + 360) % 360) as QuarterTurn

/** Largest |offset| (in % of the slot's width / height) that still leaves no gap. */
export function offsetLimits(transform: Pick<SlotTransform, 'scale' | 'rotation'>, photo: Size, slot: Size) {
  const cover = computeCover(photo.width, photo.height, slot.width, slot.height, transform.rotation)
  const rotated = rotatedSize(photo, transform.rotation)
  const scale = clampScale(transform.scale)
  return {
    x: Math.max(0, (rotated.width * cover * scale - slot.width) / 2 / slot.width * 100),
    y: Math.max(0, (rotated.height * cover * scale - slot.height) / 2 / slot.height * 100),
  }
}

const clampTo = (value: number, limit: number) => Math.min(limit, Math.max(-limit, Number.isFinite(value) ? value : 0))

/** Scale within 1–3× and offsets kept inside the photo: the slot never shows an empty edge. */
export function clampOffset(transform: SlotTransform, photo: Size, slot: Size): SlotTransform {
  const scale = clampScale(transform.scale)
  const rotation = normalizeQuarterTurn(transform.rotation)
  const limits = offsetLimits({ scale, rotation }, photo, slot)
  return { ...transform, scale, rotation, offsetX: clampTo(transform.offsetX, limits.x), offsetY: clampTo(transform.offsetY, limits.y) }
}

/** Drag past the edge: the excess is damped (rubber band); `clampOffset` snaps it back on release. */
export function rubberBand(transform: SlotTransform, photo: Size, slot: Size, resistance = 0.35): SlotTransform {
  const limits = offsetLimits(transform, photo, slot)
  const band = (value: number, limit: number) => Math.abs(value) <= limit ? value : Math.sign(value) * (limit + (Math.abs(value) - limit) * resistance)
  return { ...transform, offsetX: band(transform.offsetX, limits.x), offsetY: band(transform.offsetY, limits.y) }
}

export interface PhotoPlacement {
  /** Unrotated photo size drawn in slot units. */
  width: number
  height: number
  /** Photo centre, from the slot's top-left corner, in slot units. */
  centerX: number
  centerY: number
  rotation: QuarterTurn
  flipX: boolean
}

/** Where the photo sits inside a slot. The screen (CSS) and the print file (canvas) both draw from this. */
export function placePhoto(transform: SlotTransform, photo: Size, slot: Size): PhotoPlacement {
  const clamped = clampOffset(transform, photo, slot)
  const scale = computeCover(photo.width, photo.height, slot.width, slot.height, clamped.rotation) * clamped.scale
  return {
    width: photo.width * scale,
    height: photo.height * scale,
    centerX: slot.width / 2 + clamped.offsetX / 100 * slot.width,
    centerY: slot.height / 2 + clamped.offsetY / 100 * slot.height,
    rotation: clamped.rotation,
    flipX: clamped.flipX,
  }
}

/**
 * Zoom keeping the photo point under `anchor` still (pinch midpoint, double-tap point, wheel).
 * `anchor` is measured from the slot centre in slot units.
 */
export function zoomAround(transform: SlotTransform, nextScale: number, anchor: { x: number; y: number }, photo: Size, slot: Size): SlotTransform {
  const from = clampScale(transform.scale)
  const to = clampScale(nextScale)
  const ratio = to / from
  const offsetX = transform.offsetX / 100 * slot.width
  const offsetY = transform.offsetY / 100 * slot.height
  return clampOffset({
    ...transform,
    scale: to,
    offsetX: (anchor.x - (anchor.x - offsetX) * ratio) / slot.width * 100,
    offsetY: (anchor.y - (anchor.y - offsetY) * ratio) / slot.height * 100,
  }, photo, slot)
}

/** Offsets that put `focus` (fractions of the unrotated photo, 0–1) at the slot centre, as far as the edges allow. */
export function focusTransform(transform: SlotTransform, focus: { x: number; y: number }, photo: Size, slot: Size): SlotTransform {
  const placement = placePhoto({ ...transform, offsetX: 0, offsetY: 0 }, photo, slot)
  let dx = (0.5 - focus.x) * placement.width
  let dy = (0.5 - focus.y) * placement.height
  if (transform.flipX) dx = -dx
  const turns = placement.rotation / 90
  for (let turn = 0; turn < turns; turn += 1) [dx, dy] = [-dy, dx]
  return clampOffset({ ...transform, offsetX: dx / slot.width * 100, offsetY: dy / slot.height * 100 }, photo, slot)
}

/** Original pixels per printed inch inside the slot (lower = blurrier print). */
export function effectivePrintDpi(transform: SlotTransform, original: Size, slot: Size, templateDpi: number) {
  const scale = computeCover(original.width, original.height, slot.width, slot.height, transform.rotation) * clampScale(transform.scale)
  return templateDpi / scale
}

/** Canvas pixels per inch, from the room's print size ("5x15" cm, "2x6 in"). */
export function templateDpi(canvas: Size, printSize?: string | null) {
  const match = printSize?.match(/^\s*(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(cm|in)?\s*$/i)
  if (!match) return DEFAULT_TEMPLATE_DPI
  const toInches = (value: string) => Number(value.replace(',', '.')) / (match[3]?.toLowerCase() === 'in' ? 1 : 2.54)
  const [short, long] = [toInches(match[1]!), toInches(match[2]!)].sort((a, b) => a - b)
  const [canvasShort, canvasLong] = [canvas.width, canvas.height].sort((a, b) => a - b)
  const dpi = Math.min(canvasShort! / short!, canvasLong! / long!)
  return Number.isFinite(dpi) && dpi > 0 ? dpi : DEFAULT_TEMPLATE_DPI
}

interface LegacyTransform { zoom?: unknown; x?: unknown; y?: unknown; rotation?: unknown; flipX?: unknown; flipY?: unknown }

const finite = (value: unknown, fallback: number) => typeof value === 'number' && Number.isFinite(value) ? value : fallback

/**
 * Sessions saved before the editor upgrade stored `{ zoom, x, y, rotation, flipX, flipY }` plus
 * `fit` and `filter`. x/y were already fractions of the slot, so they become percentages; zoom
 * only carries over for "cover" photos (a "contain" zoom has no cover equivalent without the
 * photo size, so those start at cover). Rotation snaps to quarter turns; flipY = 180° + flipX.
 */
export function migrateLegacySlotTransform(legacy: LegacyTransform, fit?: unknown, filter?: unknown): SlotTransform {
  let rotation = normalizeQuarterTurn(finite(legacy.rotation, 0))
  let flipX = legacy.flipX === true
  if (legacy.flipY === true) { rotation = normalizeQuarterTurn(rotation + 180); flipX = !flipX }
  return {
    scale: fit === 'cover' ? clampScale(finite(legacy.zoom, 1)) : MIN_SLOT_SCALE,
    offsetX: finite(legacy.x, 0) * 100,
    offsetY: finite(legacy.y, 0) * 100,
    rotation,
    flipX,
    grayscale: filter === 'grayscale',
  }
}

/** A stored transform in either shape → the current shape (null when unusable). */
export function readStoredSlotTransform(stored: unknown, fit?: unknown, filter?: unknown): SlotTransform | null {
  if (!stored || typeof stored !== 'object') return null
  const value = stored as Record<string, unknown>
  if ('zoom' in value) return Number.isFinite(value.zoom) ? migrateLegacySlotTransform(value, fit, filter) : null
  if (![value.scale, value.offsetX, value.offsetY].every((item) => typeof item === 'number' && Number.isFinite(item))) return null
  return {
    scale: clampScale(value.scale as number),
    offsetX: value.offsetX as number,
    offsetY: value.offsetY as number,
    rotation: normalizeQuarterTurn(finite(value.rotation, 0)),
    flipX: value.flipX === true,
    grayscale: value.grayscale === true,
  }
}
