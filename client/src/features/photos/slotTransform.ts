import type { SlotTransform } from '../../types/selfBooth'

export interface Size { width: number; height: number }

/** 1 = the photo just covers the slot ("cover"); customers can zoom up to 3×, and down until the whole photo fits ("contain"). */
export const MIN_SLOT_SCALE = 1
export const MAX_SLOT_SCALE = 3
export const SLOT_SCALE_STEP = 0.25
/** Two-finger twist: within this many degrees of 0/90/180/270 the photo snaps straight. */
export const ROTATION_SNAP_DEGREES = 4
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
const radians = (degrees: number) => degrees * Math.PI / 180
const trig = (degrees: number) => ({ cos: Math.abs(Math.cos(radians(degrees))), sin: Math.abs(Math.sin(radians(degrees))) })

/** Any angle → (-180, 180]; floating noise around quarter turns is removed. */
export function normalizeRotation(degrees: number) {
  if (!Number.isFinite(degrees)) return 0
  let value = ((degrees % 360) + 360) % 360
  if (value > 180) value -= 360
  return Math.round(value * 1000) / 1000
}

/** Two-finger twist ends near a quarter turn → exactly that quarter turn. */
export function snapRotation(degrees: number, within = ROTATION_SNAP_DEGREES) {
  const nearest = Math.round(degrees / 90) * 90
  return Math.abs(degrees - nearest) <= within ? normalizeRotation(nearest) : normalizeRotation(degrees)
}

/** Scale (slot px per photo px) at which the photo, rotated by any angle, just covers the slot. Shared by screen and print. */
export function computeCover(photoW: number, photoH: number, slotW: number, slotH: number, rotation: number = 0) {
  if (!validSize({ width: photoW, height: photoH }) || !validSize({ width: slotW, height: slotH })) throw new Error('Photo and slot dimensions must be positive finite numbers.')
  const { cos, sin } = trig(rotation)
  return Math.max((slotW * cos + slotH * sin) / photoW, (slotW * sin + slotH * cos) / photoH)
}

/** Scale at which the whole rotated photo fits inside the slot. */
export function computeContain(photoW: number, photoH: number, slotW: number, slotH: number, rotation: number = 0) {
  const { cos, sin } = trig(rotation)
  return Math.min(slotW / (photoW * cos + photoH * sin), slotH / (photoW * sin + photoH * cos))
}

/** Smallest scale (relative to cover): the whole photo inside the slot, like the old "kéo nhỏ lại cả hình vào khung". */
export function minSlotScale(photo: Size, slot: Size, rotation: number) {
  return Math.min(MIN_SLOT_SCALE, computeContain(photo.width, photo.height, slot.width, slot.height, rotation) / computeCover(photo.width, photo.height, slot.width, slot.height, rotation))
}

export function clampScale(scale: number, minimum = MIN_SLOT_SCALE) {
  return Number.isFinite(scale) ? Math.min(MAX_SLOT_SCALE, Math.max(minimum, scale)) : MIN_SLOT_SCALE
}

const clampFor = (transform: Pick<SlotTransform, 'scale' | 'rotation'>, photo: Size, slot: Size) => clampScale(transform.scale, minSlotScale(photo, slot, transform.rotation))

/**
 * How far the photo centre may move, measured along the photo's own (rotated) axes, in slot
 * units. Photo larger than the slot: no gap may open (exact for any angle). Photo smaller
 * (zoomed out): it stays inside the slot.
 */
function axisLimits(transform: Pick<SlotTransform, 'scale' | 'rotation'>, photo: Size, slot: Size) {
  const scale = computeCover(photo.width, photo.height, slot.width, slot.height, transform.rotation) * clampFor(transform, photo, slot)
  const { cos, sin } = trig(transform.rotation)
  const slotAlongX = (slot.width * cos + slot.height * sin) / 2
  const slotAlongY = (slot.width * sin + slot.height * cos) / 2
  return { u: Math.abs(photo.width * scale / 2 - slotAlongX), v: Math.abs(photo.height * scale / 2 - slotAlongY) }
}

const toPhotoAxes = (dx: number, dy: number, degrees: number) => { const a = radians(degrees); return { u: dx * Math.cos(a) + dy * Math.sin(a), v: -dx * Math.sin(a) + dy * Math.cos(a) } }
const toSlotAxes = (u: number, v: number, degrees: number) => { const a = radians(degrees); return { x: u * Math.cos(a) - v * Math.sin(a), y: u * Math.sin(a) + v * Math.cos(a) } }
const clampTo = (value: number, limit: number) => Math.min(limit, Math.max(-limit, Number.isFinite(value) ? value : 0))

/** Largest |offset| (in % of the slot's width / height) along each slot axis; exact for quarter turns. */
export function offsetLimits(transform: Pick<SlotTransform, 'scale' | 'rotation'>, photo: Size, slot: Size) {
  const { u, v } = axisLimits(transform, photo, slot)
  const { cos, sin } = trig(transform.rotation)
  return { x: (u * cos + v * sin) / slot.width * 100, y: (u * sin + v * cos) / slot.height * 100 }
}

/** Scale between contain and 3×, rotation normalised, offsets kept so the photo never leaves a gap (or, zoomed out, never leaves the slot). */
export function clampOffset(transform: SlotTransform, photo: Size, slot: Size): SlotTransform {
  const rotation = normalizeRotation(transform.rotation)
  const scale = clampFor({ scale: transform.scale, rotation }, photo, slot)
  const limits = axisLimits({ scale, rotation }, photo, slot)
  const along = toPhotoAxes((Number.isFinite(transform.offsetX) ? transform.offsetX : 0) / 100 * slot.width, (Number.isFinite(transform.offsetY) ? transform.offsetY : 0) / 100 * slot.height, rotation)
  const back = toSlotAxes(clampTo(along.u, limits.u), clampTo(along.v, limits.v), rotation)
  return { ...transform, scale, rotation, offsetX: back.x / slot.width * 100, offsetY: back.y / slot.height * 100 }
}

/** Drag past the edge: the excess is damped (rubber band); `clampOffset` snaps it back on release. */
export function rubberBand(transform: SlotTransform, photo: Size, slot: Size, resistance = 0.35): SlotTransform {
  const clamped = clampOffset({ ...transform, scale: transform.scale }, photo, slot)
  return { ...transform, scale: clamped.scale, offsetX: clamped.offsetX + (transform.offsetX - clamped.offsetX) * resistance, offsetY: clamped.offsetY + (transform.offsetY - clamped.offsetY) * resistance }
}

export interface PhotoPlacement {
  /** Unrotated photo size drawn in slot units. */
  width: number
  height: number
  /** Photo centre, from the slot's top-left corner, in slot units. */
  centerX: number
  centerY: number
  /** Degrees, clockwise. */
  rotation: number
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
 * Zoom keeping the photo point under `anchor` still (double-tap point, wheel, slider centre).
 * `anchor` is measured from the slot centre in slot units.
 */
export function zoomAround(transform: SlotTransform, nextScale: number, anchor: { x: number; y: number }, photo: Size, slot: Size): SlotTransform {
  const minimum = minSlotScale(photo, slot, transform.rotation)
  const from = clampScale(transform.scale, minimum)
  const to = clampScale(nextScale, minimum)
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

/**
 * Pinch + twist from a gesture start: the photo point under the fingers' start midpoint follows
 * the current midpoint, scaled by `ratio` and turned by `turn` degrees around it.
 */
export function pinchTransform(origin: SlotTransform, from: { x: number; y: number }, to: { x: number; y: number }, ratio: number, turn: number, slot: Size): SlotTransform {
  const a = radians(turn)
  const dx = origin.offsetX / 100 * slot.width - from.x
  const dy = origin.offsetY / 100 * slot.height - from.y
  return {
    ...origin,
    scale: origin.scale * ratio,
    rotation: origin.rotation + turn,
    offsetX: (to.x + (dx * Math.cos(a) - dy * Math.sin(a)) * ratio) / slot.width * 100,
    offsetY: (to.y + (dx * Math.sin(a) + dy * Math.cos(a)) * ratio) / slot.height * 100,
  }
}

/** Offsets that put `focus` (fractions of the unrotated photo, 0–1) at the slot centre, as far as the edges allow. */
export function focusTransform(transform: SlotTransform, focus: { x: number; y: number }, photo: Size, slot: Size): SlotTransform {
  const placement = placePhoto({ ...transform, offsetX: 0, offsetY: 0 }, photo, slot)
  let x = (focus.x - 0.5) * placement.width
  const y = (focus.y - 0.5) * placement.height
  if (transform.flipX) x = -x
  const turned = toSlotAxes(x, y, placement.rotation)
  return clampOffset({ ...transform, offsetX: -turned.x / slot.width * 100, offsetY: -turned.y / slot.height * 100 }, photo, slot)
}

/** Original pixels per printed inch inside the slot (lower = blurrier print). */
export function effectivePrintDpi(transform: SlotTransform, original: Size, slot: Size, templateDpi: number) {
  const scale = computeCover(original.width, original.height, slot.width, slot.height, transform.rotation) * clampFor(transform, original, slot)
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
 * photo size, so those start at cover). Rotation is kept; flipY = 180° + flipX.
 */
export function migrateLegacySlotTransform(legacy: LegacyTransform, fit?: unknown, filter?: unknown): SlotTransform {
  let rotation = normalizeRotation(finite(legacy.rotation, 0))
  let flipX = legacy.flipX === true
  if (legacy.flipY === true) { rotation = normalizeRotation(rotation + 180); flipX = !flipX }
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
    scale: clampScale(value.scale as number, 0.05),
    offsetX: value.offsetX as number,
    offsetY: value.offsetY as number,
    rotation: normalizeRotation(finite(value.rotation, 0)),
    flipX: value.flipX === true,
    grayscale: value.grayscale === true,
  }
}
