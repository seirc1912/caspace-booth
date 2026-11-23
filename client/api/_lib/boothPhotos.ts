import type { SupabaseClient } from '@supabase/supabase-js'
import { BOOTH_ACCESS_FILE, BOOTH_FOLDER, boothThumbnailPath } from './boothPaths.js'
import { UploadApiError } from './http.js'
import { customerPhotoBucket } from './supabaseStorage.js'

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

/**
 * Same answer ("unavailable", no data) for "no booth photos" and "expired", so a
 * phone number cannot be probed for whether someone visited the shop.
 */
export async function listBoothPhotos(client: SupabaseClient, phone: string, now = Date.now()): Promise<BoothPhotoList> {
  const { photos, newest, hasAccessFile } = await listBoothObjects(client, phone)
  if (!photos.length) return { status: 'unavailable', photos: [] }
  const until = boothViewableUntil(newest, hasAccessFile ? await readReopenedAt(client, phone) : null)
  if (until === null || until <= now) return { status: 'unavailable', photos: [] }
  const paths = photos.map((entry) => `${phone}/${BOOTH_FOLDER}/${entry.name}`)
  const bucket = client.storage.from(customerPhotoBucket)
  const [thumbs, originals] = await Promise.all([
    bucket.createSignedUrls(paths.map(boothThumbnailPath), BOOTH_SIGNED_URL_SECONDS),
    bucket.createSignedUrls(paths, BOOTH_SIGNED_URL_SECONDS),
  ])
  if (originals.error) throw new UploadApiError(502, 'Không thể tải ảnh phòng chụp.')
  const items: BoothPhoto[] = []
  photos.forEach((entry, index) => {
    const original = originals.data?.[index]
    if (!original?.signedUrl || original.error) return
    const thumb = thumbs.data?.[index]
    items.push({ id: entry.name, name: entry.name, thumbUrl: thumb && !thumb.error && thumb.signedUrl ? thumb.signedUrl : null, originalUrl: original.signedUrl, uploadedAt: entry.created_at ?? '' })
  })
  return { status: 'ok', photos: items, viewableUntil: new Date(until).toISOString() }
}

export interface BoothAccessStatus { boothPhotoCount: number; viewableUntil: string | null; viewable: boolean }

export async function boothAccessStatus(client: SupabaseClient, phone: string, now = Date.now()): Promise<BoothAccessStatus> {
  const { photos, newest, hasAccessFile } = await listBoothObjects(client, phone)
  const until = photos.length ? boothViewableUntil(newest, hasAccessFile ? await readReopenedAt(client, phone) : null) : null
  return { boothPhotoCount: photos.length, viewableUntil: until === null ? null : new Date(until).toISOString(), viewable: until !== null && until > now }
}

/** Staff "Mở lại 6 giờ": stores the click time (the 6-hour rule adds the window). */
export async function reopenBoothAccess(client: SupabaseClient, phone: string, now = Date.now()) {
  const { photos } = await listBoothObjects(client, phone)
  if (!photos.length) throw new UploadApiError(404, 'Số này không có ảnh phòng chụp trên hệ thống. Hãy dùng "Gửi lại thư mục" ở máy phòng chụp.')
  const body = JSON.stringify({ reopenedAt: new Date(now).toISOString() })
  const { error } = await client.storage.from(customerPhotoBucket).upload(`${phone}/${BOOTH_FOLDER}/${BOOTH_ACCESS_FILE}`, new Blob([body], { type: 'application/json' }), { upsert: true, contentType: 'application/json' })
  if (error) throw new UploadApiError(502, 'Không thể mở lại ảnh phòng chụp. Vui lòng thử lại.')
  return boothAccessStatus(client, phone, now)
}
