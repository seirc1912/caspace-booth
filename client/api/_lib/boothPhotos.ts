import type { SupabaseClient } from '@supabase/supabase-js'
import { BOOTH_FOLDER, boothPreviewPath, boothThumbnailPath } from './boothPaths.js'
import { UploadApiError } from './http.js'
import { originalFilename } from './staffPhotos.js'
import { customerPhotoBucket, thumbnailPathFor } from './supabaseStorage.js'

export const BOOTH_SIGNED_URL_SECONDS = 60 * 60
const imagePattern = /\.jpe?g$/i
const PAGE = 1_000

/** previewUrl: 1600px copy for the large viewer (booth photos sent by an updated booth PC); originals stay for saving and printing. */
export interface BoothPhoto { id: string; name: string; thumbUrl: string | null; previewUrl: string | null; originalUrl: string; uploadedAt: string }
export type BoothPhotoList = { status: 'ok'; photos: BoothPhoto[] } | { status: 'unavailable'; photos: [] }

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
  return { photos }
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

interface PickerCandidate { id: string; name: string; path: string; thumbPath: string; previewPath: string | null; uploadedAt: string }

/**
 * What the customer may pick after entering a room: booth originals (shooting order)
 * followed by photos they sent via /upload-anh. No viewing window: photos stay visible
 * until the hourly cron deletes them (booth photos and uploads after 6 hours).
 */
export async function listPickerCandidates(client: SupabaseClient, phone: string) {
  const [booth, uploads] = await Promise.all([listBoothObjects(client, phone), listCustomerUploads(client, phone)])
  const candidates: PickerCandidate[] = [
    ...booth.photos.map((entry) => { const path = `${phone}/${BOOTH_FOLDER}/${entry.name}`; return { id: entry.name, name: entry.name, path, thumbPath: boothThumbnailPath(path), previewPath: boothPreviewPath(path), uploadedAt: entry.created_at ?? '' } }),
    ...uploads.map((entry) => { const path = `${phone}/${entry.name}`; return { id: `upload:${entry.name}`, name: originalFilename(entry.name), path, thumbPath: thumbnailPathFor(path), previewPath: null, uploadedAt: entry.created_at ?? '' } }),
  ]
  return { candidates, boothCount: booth.photos.length }
}

/** "unavailable" (no data) when the phone has no photos, so nothing else is revealed. */
export async function listBoothPhotos(client: SupabaseClient, phone: string): Promise<BoothPhotoList> {
  const { candidates } = await listPickerCandidates(client, phone)
  if (!candidates.length) return { status: 'unavailable', photos: [] }
  const bucket = client.storage.from(customerPhotoBucket)
  const previewCandidates = candidates.filter((item) => item.previewPath)
  const [thumbs, originals, previews] = await Promise.all([
    bucket.createSignedUrls(candidates.map((item) => item.thumbPath), BOOTH_SIGNED_URL_SECONDS),
    bucket.createSignedUrls(candidates.map((item) => item.path), BOOTH_SIGNED_URL_SECONDS),
    previewCandidates.length ? bucket.createSignedUrls(previewCandidates.map((item) => item.previewPath!), BOOTH_SIGNED_URL_SECONDS) : Promise.resolve({ data: [], error: null }),
  ])
  // Photos sent before the booth PC was updated have no preview: the viewer falls back to the original.
  const previewUrls = new Map<string, string>()
  previewCandidates.forEach((item, index) => { const signed = previews.data?.[index]; if (signed && !signed.error && signed.signedUrl) previewUrls.set(item.id, signed.signedUrl) })
  if (originals.error) throw new UploadApiError(502, 'Không thể tải ảnh phòng chụp.')
  const items: BoothPhoto[] = []
  candidates.forEach((item, index) => {
    const original = originals.data?.[index]
    if (!original?.signedUrl || original.error) return
    const thumb = thumbs.data?.[index]
    items.push({ id: item.id, name: item.name, thumbUrl: thumb && !thumb.error && thumb.signedUrl ? thumb.signedUrl : null, previewUrl: previewUrls.get(item.id) ?? null, originalUrl: original.signedUrl, uploadedAt: item.uploadedAt })
  })
  return items.length ? { status: 'ok', photos: items } : { status: 'unavailable', photos: [] }
}

export interface BoothAccessStatus { boothPhotoCount: number; pickerPhotoCount: number }

/** Staff view: how many photos the customer can pick from. */
export async function boothAccessStatus(client: SupabaseClient, phone: string): Promise<BoothAccessStatus> {
  const { candidates, boothCount } = await listPickerCandidates(client, phone)
  return { boothPhotoCount: boothCount, pickerPhotoCount: candidates.length }
}
