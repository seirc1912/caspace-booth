import { clearUploadSession, ensureUploadSession } from '../photoUpload/uploadClient'

/** previewUrl: 1600px copy for viewing large; originalUrl: full file for saving and printing. */
export interface BoothPhoto { id: string; name: string; thumbUrl: string | null; previewUrl?: string | null; originalUrl: string; uploadedAt: string }
/** Small image for grids and the tray: thumbnail, else the 1600px preview, else the original (photos whose thumbnail never finished uploading). */
export const boothPhotoThumb = (photo: BoothPhoto) => photo.thumbUrl ?? photo.previewUrl ?? photo.originalUrl
export type BoothPhotoList = { status: 'ok'; photos: BoothPhoto[] } | { status: 'unavailable'; photos: [] }
/**
 * Originals for the photos actually used (Auto Fill, Add Image), with progress; a
 * failed download is skipped instead of blocking the others.
 */
export async function loadBoothOriginals(photos: BoothPhoto[], load: (photo: BoothPhoto) => Promise<File>, onProgress?: (done: number, total: number) => void) {
  let done = 0
  const settled = await Promise.allSettled(photos.map((photo) => load(photo).finally(() => onProgress?.(++done, photos.length))))
  return settled.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []))
}

export const BOOTH_POLL_MS = 10_000
export const BOOTH_DOWNLOAD_CONCURRENCY = 2

async function post(phone: string, token: string, fetchImpl: typeof fetch) {
  return fetchImpl('/api/booth-photos/list', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-upload-session': token }, body: JSON.stringify({ phone }) })
}

/** Booth photos + the customer's own uploads for a phone (kept 6 hours). "unavailable" = none. */
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


/** Most booth photos used at once: Auto Fill (keeps phones responsive). */
export const MAX_BOOTH_SELECTION = 20

/**
 * Signed links last 60 minutes, but the editor re-lists every 10 s and each answer carries new
 * links. A new link makes the browser download the image again (the large viewer restarted its
 * sharp download every 10 s, and thumbnails were fetched again each time). Photos already known
 * keep their first links for 45 minutes, so nothing reloads; the array itself is kept when
 * nothing changed, so React does not re-render.
 */
export const BOOTH_URL_REUSE_MS = 45 * 60_000
export interface StableBoothPhotos { photos: BoothPhoto[]; issuedAt: Record<string, number> }

export function stabilizeBoothPhotos(previous: StableBoothPhotos | null, next: BoothPhoto[], now = Date.now()): StableBoothPhotos {
  const known = new Map((previous?.photos ?? []).map((photo) => [photo.id, photo]))
  const issuedAt: Record<string, number> = {}
  const photos = next.map((photo) => {
    const old = known.get(photo.id)
    const oldIssuedAt = previous?.issuedAt[photo.id]
    if (old && oldIssuedAt !== undefined && now - oldIssuedAt < BOOTH_URL_REUSE_MS) { issuedAt[photo.id] = oldIssuedAt; return old }
    issuedAt[photo.id] = now
    return photo
  })
  const unchanged = previous !== null && previous.photos.length === photos.length && photos.every((photo, index) => photo === previous.photos[index])
  return unchanged ? previous : { photos, issuedAt }
}
