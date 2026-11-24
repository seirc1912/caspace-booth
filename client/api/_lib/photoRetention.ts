import type { SupabaseClient } from '@supabase/supabase-js'
import { BOOTH_FOLDER, BOOTH_PREVIEWS, BOOTH_THUMBS } from './boothPaths.js'
import { customerPhotoBucket, THUMBNAIL_FOLDER } from './supabaseStorage.js'

// Owner decisions: booth photos and their thumbnails/previews are kept 6 hours (24/11/2026);
// photos customers send (/upload-anh) also 6 hours (25/11/2026), to keep Storage small.
// Only Supabase copies are deleted: the booth PCs keep their folders (staff resend if needed),
// and customers still have their own photos on their phone.
export const UPLOAD_RETENTION_HOURS = 6
export const BOOTH_RETENTION_HOURS = 6
const PAGE = 1_000
const LIST_CONCURRENCY = 8

export type Entry = { id: string | null; name: string; created_at: string | null; updated_at?: string | null }

export async function listAll(client: SupabaseClient, prefix: string, sortColumn: 'name' | 'created_at', bucket = customerPhotoBucket) {
  const entries: Entry[] = []
  for (let offset = 0; ; offset += PAGE) {
    const page = await client.storage.from(bucket).list(prefix, { limit: PAGE, offset, sortBy: { column: sortColumn, order: 'asc' } })
    if (page.error) throw page.error
    entries.push(...(page.data as Entry[]))
    if (page.data.length < PAGE) return entries
  }
}

/** Every prefix that holds objects for one customer folder. */
export function retentionPrefixes(folder: string) {
  return [folder, `${folder}/${THUMBNAIL_FOLDER}`, `${folder}/${BOOTH_FOLDER}`, `${folder}/${BOOTH_FOLDER}/${BOOTH_THUMBS}`, `${folder}/${BOOTH_FOLDER}/${BOOTH_PREVIEWS}`]
}

const isBoothPrefix = (prefix: string) => prefix.split('/')[1] === BOOTH_FOLDER

/**
 * Expired objects in every customer folder: frames and their `_thumbs/` older than `cutoff`;
 * booth photos `_booth/`, booth thumbnails and previews older than `boothCutoff`.
 * Age = last write (`updated_at`), so a re-sent photo starts its window again.
 */
export async function listExpiredPhotoObjects(client: SupabaseClient, cutoff: number, boothCutoff = cutoff) {
  const expired: string[] = []
  const folders = (await listAll(client, '', 'name')).filter((entry) => entry.id === null).map((entry) => entry.name)
  for (let index = 0; index < folders.length; index += LIST_CONCURRENCY) {
    const prefixes = folders.slice(index, index + LIST_CONCURRENCY).flatMap(retentionPrefixes)
    const listings = await Promise.all(prefixes.map((prefix) => listAll(client, prefix, 'created_at')))
    listings.forEach((objects, position) => {
      for (const object of objects) {
        const writtenAt = Date.parse(object.updated_at ?? object.created_at ?? '')
        const limit = isBoothPrefix(prefixes[position]!) ? boothCutoff : cutoff
        if (object.id && Number.isFinite(writtenAt) && writtenAt < limit) expired.push(`${prefixes[position]}/${object.name}`)
      }
    })
  }
  return { folders: folders.length, expired }
}

export async function removePhotoObjects(client: SupabaseClient, paths: string[]) {
  let removed = 0
  for (let index = 0; index < paths.length; index += 100) {
    const batch = paths.slice(index, index + 100)
    const result = await client.storage.from(customerPhotoBucket).remove(batch)
    if (result.error) throw result.error
    removed += batch.length
  }
  return removed
}
