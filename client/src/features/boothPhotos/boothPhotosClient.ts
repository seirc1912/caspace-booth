import { clearUploadSession, ensureUploadSession } from '../photoUpload/uploadClient'

export interface BoothPhoto { id: string; name: string; thumbUrl: string | null; originalUrl: string; uploadedAt: string }
export type BoothPhotoList = { status: 'ok'; photos: BoothPhoto[] } | { status: 'unavailable'; photos: [] }
/** A ticked photo in the editor. `file` is null while its original is still downloading. */
export interface BoothPoolPhoto { id: string; thumbUrl: string | null; file: File | null; ready: Promise<File> }

/** Originals that downloaded; a failed one is skipped instead of blocking the others. */
export async function readyPoolFiles(pool: BoothPoolPhoto[]) {
  const settled = await Promise.allSettled(pool.map((photo) => photo.ready))
  return settled.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []))
}

export const BOOTH_POLL_MS = 10_000
export const BOOTH_DOWNLOAD_CONCURRENCY = 2

async function post(phone: string, token: string, fetchImpl: typeof fetch) {
  return fetchImpl('/api/booth-photos/list', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-upload-session': token }, body: JSON.stringify({ phone }) })
}

/** Booth photos + the customer's own uploads for a phone (kept 3 days). "unavailable" = none. */
export async function fetchBoothPhotos(phone: string, fetchImpl: typeof fetch = fetch, session = ensureUploadSession): Promise<BoothPhotoList> {
  let response = await post(phone, await session(), fetchImpl)
  if (response.status === 401) { clearUploadSession(); response = await post(phone, await session(true), fetchImpl) }
  const body = await response.json().catch(() => ({})) as BoothPhotoList & { error?: string }
  if (!response.ok) throw new Error(body.error ?? 'Không tải được ảnh phòng chụp.')
  return body.status === 'ok' ? body : { status: 'unavailable', photos: [] }
}

/**
 * Downloads originals of booth photos, two at a time, once each. The picker calls
 * `prefetch` as soon as a photo is ticked, so "DÙNG N ẢNH" usually finds them ready.
 */
export function createBoothPhotoLoader(fetchImpl: typeof fetch = fetch, concurrency = BOOTH_DOWNLOAD_CONCURRENCY) {
  const cache = new Map<string, Promise<File>>()
  const waiting: Array<() => void> = []
  let active = 0
  const acquire = async () => {
    while (active >= concurrency) await new Promise<void>((resolve) => waiting.push(resolve))
    active += 1
  }
  const release = () => { active -= 1; waiting.shift()?.() }
  const load = (photo: BoothPhoto) => {
    let pending = cache.get(photo.id)
    if (!pending) {
      pending = (async () => {
        await acquire()
        try {
          const response = await fetchImpl(photo.originalUrl)
          if (!response.ok) throw new Error('Không tải được ảnh gốc. Vui lòng thử lại.')
          const blob = await response.blob()
          // Booth photos are JPEG; customer uploads may be PNG.
          const type = blob.type.startsWith('image/') ? blob.type : /\.png$/i.test(photo.name) ? 'image/png' : 'image/jpeg'
          return new File([blob], photo.name, { type, lastModified: Date.parse(photo.uploadedAt) || Date.now() })
        } finally { release() }
      })()
      pending.catch(() => cache.delete(photo.id))
      cache.set(photo.id, pending)
    }
    return pending
  }
  return { load, prefetch: (photo: BoothPhoto) => { load(photo).catch(() => undefined) } }
}

export type BoothPhotoLoader = ReturnType<typeof createBoothPhotoLoader>

/** Originals of the ticked photos only (thumbnails are all the grid ever loads). */
export async function loadBoothPhotoFiles(photos: BoothPhoto[], onProgress?: (done: number, total: number) => void, fetchImpl: typeof fetch = fetch, loader: BoothPhotoLoader = createBoothPhotoLoader(fetchImpl)) {
  let done = 0
  return Promise.all(photos.map((photo) => loader.load(photo).then((file) => { onProgress?.(++done, photos.length); return file })))
}

const selectionKey = (phone: string) => `caspace.booth-selection.${phone}`

export function loadBoothSelection(phone: string): string[] {
  try {
    const value = JSON.parse(sessionStorage.getItem(selectionKey(phone)) ?? '[]') as unknown
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
  } catch { return [] }
}

export function saveBoothSelection(phone: string, ids: string[]) {
  try { sessionStorage.setItem(selectionKey(phone), JSON.stringify(ids)) } catch { /* private mode: keep in memory only */ }
}

/**
 * iPhone/iPad can only put images into Photos through the share sheet; Android and
 * desktop browsers save straight to Downloads (which the gallery shows).
 */
export function prefersShareSheet(userAgent = navigator.userAgent, maxTouchPoints = navigator.maxTouchPoints) {
  return /iPhone|iPad|iPod/i.test(userAgent) || (/Macintosh/i.test(userAgent) && maxTouchPoints > 1)
}

/** Signed URL that makes Storage answer with Content-Disposition: attachment. */
export function boothDownloadUrl(photo: Pick<BoothPhoto, 'originalUrl' | 'name'>) {
  const url = new URL(photo.originalUrl)
  url.searchParams.set('download', photo.name)
  return url.toString()
}

/**
 * Direct downloads (no in-page fetch, no "preparing" wait): the browser's download
 * manager fetches each original. Spaced out so Chrome treats them as separate files.
 */
export async function downloadBoothPhotos(photos: Array<Pick<BoothPhoto, 'originalUrl' | 'name'>>, gapMs = 400, click = (href: string) => {
  const link = document.createElement('a')
  link.href = href
  link.rel = 'noopener'
  document.body.append(link)
  link.click()
  link.remove()
}) {
  for (const [index, photo] of photos.entries()) {
    if (index) await new Promise((resolve) => setTimeout(resolve, gapMs))
    click(boothDownloadUrl(photo))
  }
}
