import type { SupabaseClient } from '@supabase/supabase-js'
import { BOOTH_ACCESS_FILE, BOOTH_FOLDER, boothThumbnailPath } from './boothPaths.js'
import { UploadApiError } from './http.js'
import { originalFilename } from './staffPhotos.js'
import { customerPhotoBucket, thumbnailPathFor } from './supabaseStorage.js'

export const BOOTH_VIEW_WINDOW_MS = 6 * 60 * 60_000
export const BOOTH_SIGNED_URL_SECONDS = 60 * 60
const imagePattern = /\.jpe?g$/i
const PAGE = 1_000

export interface BoothPhoto { id: string; name: string; thumbUrl: string | null; originalUrl: string; uploadedAt: string }
export type BoothPhotoList = { status: 'ok'; photos: BoothPhoto[]; viewableUntil: string } | { status: 'unavailable'; photos: [] }

/** Customers can view booth photos for 6 h after the newest upload or after staff reopen. */
export function boothViewableUntil(newestUploadAt: string | null, reopenedAt: string | null) {
  const times = [newestUploadAt, reopenedAt].map((value) => (value ? Date.parse(value) : NaN)).filter(Number.isFinite)
  return times.length ? Math.max(...times) + BOOTH_VIEW_WINDOW_MS : null
}

type Entry = { id: string | null; name: string; created_at: string | null; metadata?: { size?: number } | null }

export async function listBoothObjects(client: SupabaseClient, phone: string) {
  const entries: Entry[] = []
  for (let offset = 0; offset < 10 * PAGE; offset += PAGE) {
    const page = await client.storage.from(customerPhotoBucket).list(`${phone}/${BOOTH_FOLDER}`, { limit: PAGE, offset, sortBy: { column: 'name', order: 'asc' } })
    if (page.error) throw new UploadApiError(502, 'Không thể tải ảnh phòng chụp.')
    entries.push(...(page.data as Entry[]))
    if (page.data.length < PAGE) break
  }
  const photos = entries.filter((entry) => entry.id && imagePattern.test(entry.name))
  const newest = photos.reduce<string | null>((latest, entry) => (entry.created_at && (!latest || entry.created_at > latest) ? entry.created_at : latest), null)
  const hasAccessFile = entries.some((entry) => entry.id && entry.name === BOOTH_ACCESS_FILE)
  return { photos, newest, hasAccessFile }
}

export async function readReopenedAt(client: SupabaseClient, phone: string) {
  const { data, error } = await client.storage.from(customerPhotoBucket).download(`${phone}/${BOOTH_FOLDER}/${BOOTH_ACCESS_FILE}`)
  if (error || !data) return null
  try {
    const value = (JSON.parse(await data.text()) as { reopenedAt?: unknown }).reopenedAt
    return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null
  } catch { return null }
}

const uploadImagePattern = /\.(?:png|jpe?g)$/i

/**
 * Photos the customer sent through /upload-anh (top level of `{phone}/`). Frames
 * exported by the editor are named `caspace-…` and are not offered for re-framing.
 */
async function listCustomerUploads(client: SupabaseClient, phone: string) {
  const entries: Entry[] = []
  for (let offset = 0; offset < 10 * PAGE; offset += PAGE) {
    const page = await client.storage.from(customerPhotoBucket).list(phone, { limit: PAGE, offset, sortBy: { column: 'created_at', order: 'asc' } })
    if (page.error) throw new UploadApiError(502, 'Không thể tải ảnh của khách.')
    entries.push(...(page.data as Entry[]))
    if (page.data.length < PAGE) break
  }
  return entries.filter((entry) => entry.id && uploadImagePattern.test(entry.name) && !entry.name.toLowerCase().startsWith('caspace-'))
}

interface PickerCandidate { id: string; name: string; path: string; thumbPath: string; uploadedAt: string; until: number }

/**
 * What the customer may pick after entering a room, each with its own viewing deadline:
 * - booth originals: 6 h after the newest BOOTH upload or a staff reopen (trusted events only);
 * - photos sent via /upload-anh: 6 h after that photo was uploaded, or a staff reopen.
 * Anyone can upload to any phone number, so a customer upload must never extend the
 * window of booth photos or of older uploads.
 */
export async function listPickerCandidates(client: SupabaseClient, phone: string) {
  const [booth, uploads] = await Promise.all([listBoothObjects(client, phone), listCustomerUploads(client, phone)])
  const reopenedAt = booth.hasAccessFile ? await readReopenedAt(client, phone) : null
  const boothUntil = boothViewableUntil(booth.newest, reopenedAt) ?? 0
  const candidates: PickerCandidate[] = [
    ...booth.photos.map((entry) => { const path = `${phone}/${BOOTH_FOLDER}/${entry.name}`; return { id: entry.name, name: entry.name, path, thumbPath: boothThumbnailPath(path), uploadedAt: entry.created_at ?? '', until: boothUntil } }),
    ...uploads.map((entry) => { const path = `${phone}/${entry.name}`; return { id: `upload:${entry.name}`, name: originalFilename(entry.name), path, thumbPath: thumbnailPathFor(path), uploadedAt: entry.created_at ?? '', until: boothViewableUntil(entry.created_at, reopenedAt) ?? 0 } }),
  ]
  return { candidates, boothCount: booth.photos.length }
}

/**
 * Same answer ("unavailable", no data) for "no photos" and "expired", so a phone
 * number cannot be probed for whether someone visited the shop.
 */
export async function listBoothPhotos(client: SupabaseClient, phone: string, now = Date.now()): Promise<BoothPhotoList> {
  const { candidates } = await listPickerCandidates(client, phone)
  const visible = candidates.filter((item) => item.until > now)
  if (!visible.length) return { status: 'unavailable', photos: [] }
  const bucket = client.storage.from(customerPhotoBucket)
  const [thumbs, originals] = await Promise.all([
    bucket.createSignedUrls(visible.map((item) => item.thumbPath), BOOTH_SIGNED_URL_SECONDS),
    bucket.createSignedUrls(visible.map((item) => item.path), BOOTH_SIGNED_URL_SECONDS),
  ])
  if (originals.error) throw new UploadApiError(502, 'Không thể tải ảnh phòng chụp.')
  const items: BoothPhoto[] = []
  visible.forEach((item, index) => {
    const original = originals.data?.[index]
    if (!original?.signedUrl || original.error) return
    const thumb = thumbs.data?.[index]
    items.push({ id: item.id, name: item.name, thumbUrl: thumb && !thumb.error && thumb.signedUrl ? thumb.signedUrl : null, originalUrl: original.signedUrl, uploadedAt: item.uploadedAt })
  })
  const viewableUntil = Math.max(...visible.map((item) => item.until))
  return { status: 'ok', photos: items, viewableUntil: new Date(viewableUntil).toISOString() }
}

export interface BoothAccessStatus { boothPhotoCount: number; pickerPhotoCount: number; viewableUntil: string | null; viewable: boolean }

export async function boothAccessStatus(client: SupabaseClient, phone: string, now = Date.now()): Promise<BoothAccessStatus> {
  const { candidates, boothCount } = await listPickerCandidates(client, phone)
  const until = candidates.length ? Math.max(...candidates.map((item) => item.until)) : 0
  return { boothPhotoCount: boothCount, pickerPhotoCount: candidates.length, viewableUntil: until ? new Date(until).toISOString() : null, viewable: until > now }
}

/** Staff "Mở lại 6 giờ": stores the click time (the 6-hour rule adds the window). */
export async function reopenBoothAccess(client: SupabaseClient, phone: string, now = Date.now()) {
  const { candidates } = await listPickerCandidates(client, phone)
  if (!candidates.length) throw new UploadApiError(404, 'Số này không có ảnh phòng chụp trên hệ thống. Hãy dùng "Gửi lại thư mục" ở máy phòng chụp.')
  const body = JSON.stringify({ reopenedAt: new Date(now).toISOString() })
  const { error } = await client.storage.from(customerPhotoBucket).upload(`${phone}/${BOOTH_FOLDER}/${BOOTH_ACCESS_FILE}`, new Blob([body], { type: 'application/json' }), { upsert: true, contentType: 'application/json' })
  if (error) throw new UploadApiError(502, 'Không thể mở lại ảnh phòng chụp. Vui lòng thử lại.')
  return boothAccessStatus(client, phone, now)
}
