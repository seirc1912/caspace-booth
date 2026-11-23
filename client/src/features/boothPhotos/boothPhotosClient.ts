import { clearUploadSession, ensureUploadSession } from '../photoUpload/uploadClient'

export interface BoothPhoto { id: string; name: string; thumbUrl: string | null; originalUrl: string; uploadedAt: string }
export type BoothPhotoList = { status: 'ok'; photos: BoothPhoto[]; viewableUntil: string } | { status: 'unavailable'; photos: [] }
export interface BoothPoolPhoto { id: string; thumbUrl: string | null; file: File }

export const BOOTH_POLL_MS = 10_000
export const BOOTH_DOWNLOAD_CONCURRENCY = 2

async function post(phone: string, token: string, fetchImpl: typeof fetch) {
  return fetchImpl('/api/booth-photos/list', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-upload-session': token }, body: JSON.stringify({ phone }) })
}

/** Booth photos for a phone (6-hour window). "unavailable" = none or expired. */
export async function fetchBoothPhotos(phone: string, fetchImpl: typeof fetch = fetch, session = ensureUploadSession): Promise<BoothPhotoList> {
  let response = await post(phone, await session(), fetchImpl)
  if (response.status === 401) { clearUploadSession(); response = await post(phone, await session(true), fetchImpl) }
  const body = await response.json().catch(() => ({})) as BoothPhotoList & { error?: string }
  if (!response.ok) throw new Error(body.error ?? 'Không tải được ảnh phòng chụp.')
  return body.status === 'ok' ? body : { status: 'unavailable', photos: [] }
}

/**
 * Downloads the originals of the ticked photos only (thumbnails are all the grid
 * ever loads), two at a time so weak phones are not flooded.
 */
export async function loadBoothPhotoFiles(photos: BoothPhoto[], onProgress?: (done: number, total: number) => void, fetchImpl: typeof fetch = fetch) {
  const files: Array<File | null> = photos.map(() => null)
  let next = 0
  let done = 0
  const worker = async () => {
    while (next < photos.length) {
      const index = next++
      const photo = photos[index]!
      const response = await fetchImpl(photo.originalUrl)
      if (!response.ok) throw new Error('Không tải được ảnh gốc. Vui lòng thử lại.')
      const blob = await response.blob()
      files[index] = new File([blob], photo.name, { type: 'image/jpeg', lastModified: Date.parse(photo.uploadedAt) || Date.now() })
      onProgress?.(++done, photos.length)
    }
  }
  await Promise.all(Array.from({ length: Math.min(BOOTH_DOWNLOAD_CONCURRENCY, photos.length) }, worker))
  return files as File[]
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
