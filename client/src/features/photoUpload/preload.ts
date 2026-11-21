import { createThumbnail } from './thumbnail'
import { inMemoryFile } from './uploadClient'

/**
 * Some Android phones read a picked file very slowly (12–106 s for 16 MB seen on
 * 21/11/2026, file stored on the device). Start reading as soon as the customer
 * picks the photo, one file at a time, so the wait overlaps with typing the phone
 * number instead of happening after "GỬI ẢNH". Memory is bounded: files beyond
 * the budget are read at upload time as before.
 */
export const PRELOAD_BUDGET_BYTES = 150 * 1024 * 1024

const cache = new Map<File, Promise<File>>()
const thumbnails = new Map<File, Promise<File | null>>()
let reservedBytes = 0
let chain: Promise<unknown> = Promise.resolve()

/** Starts (or reuses) the in-memory read. Returns null when over the memory budget. */
export function preloadPhoto(file: File, read: (file: File) => Promise<File> = inMemoryFile): Promise<File> | null {
  const existing = cache.get(file)
  if (existing) return existing
  if (reservedBytes + file.size > PRELOAD_BUDGET_BYTES) return null
  reservedBytes += file.size
  const pending = chain.then(() => read(file))
  chain = pending.catch(() => undefined)
  cache.set(file, pending)
  return pending
}

/**
 * The 400px JPEG used both as the on-page preview and as the staff thumbnail.
 * Showing 16 MB originals in <img> kept ~64 MB decoded bitmaps per photo alive
 * and made typing laggy on Android; the full image is now decoded once here,
 * in the same one-at-a-time queue, and released immediately.
 */
export function photoThumbnail(file: File, make: (file: File) => Promise<File> = createThumbnail): Promise<File | null> {
  const existing = thumbnails.get(file)
  if (existing) return existing
  const source = cache.get(file)
  const pending = chain.then(async () => make(source ? await source : file)).catch(() => null)
  chain = pending
  thumbnails.set(file, pending)
  return pending
}

/** The in-memory copy if one was started, otherwise a fresh read (not cached). */
export function photoSource(file: File, read: (file: File) => Promise<File> = inMemoryFile) {
  return cache.get(file) ?? read(file)
}

export function releasePreload(file: File) {
  if (!cache.delete(file)) return
  reservedBytes = Math.max(0, reservedBytes - file.size)
}

/** Called when the photo leaves the selection. */
export function forgetPhoto(file: File) { releasePreload(file); thumbnails.delete(file) }

export function resetPreloadForTests() { cache.clear(); thumbnails.clear(); reservedBytes = 0; chain = Promise.resolve() }
