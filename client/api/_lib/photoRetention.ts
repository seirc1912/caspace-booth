import type { SupabaseClient } from '@supabase/supabase-js'
import { BOOTH_FOLDER, BOOTH_THUMBS } from './boothPaths.js'
import { customerPhotoBucket, THUMBNAIL_FOLDER } from './supabaseStorage.js'

// Owner decision (23/11/2026): booth originals AND frames customers send are kept 3 days.
export const PHOTO_RETENTION_DAYS = 3
const PAGE = 1_000
const LIST_CONCURRENCY = 8

type Entry = { id: string | null; name: string; created_at: string | null; updated_at?: string | null }

async function listAll(client: SupabaseClient, prefix: string, sortColumn: 'name' | 'created_at') {
  const entries: Entry[] = []
  for (let offset = 0; ; offset += PAGE) {
    const page = await client.storage.from(customerPhotoBucket).list(prefix, { limit: PAGE, offset, sortBy: { column: sortColumn, order: 'asc' } })
    if (page.error) throw page.error
    entries.push(...(page.data as Entry[]))
    if (page.data.length < PAGE) return entries
  }
}

/** Every prefix that holds objects for one customer folder. */
export function retentionPrefixes(folder: string) {
  return [folder, `${folder}/${THUMBNAIL_FOLDER}`, `${folder}/${BOOTH_FOLDER}`, `${folder}/${BOOTH_FOLDER}/${BOOTH_THUMBS}`]
}

/**
 * Objects older than the cutoff in every customer folder: frames, their `_thumbs/`,
 * booth photos `_booth/`, booth thumbnails and `_access.json`. Age = last write
 * (`updated_at`), so a staff reopen (upsert) is not deleted the next night.
 */
export async function listExpiredPhotoObjects(client: SupabaseClient, cutoff: number) {
  const expired: string[] = []
  const folders = (await listAll(client, '', 'name')).filter((entry) => entry.id === null).map((entry) => entry.name)
  for (let index = 0; index < folders.length; index += LIST_CONCURRENCY) {
    const prefixes = folders.slice(index, index + LIST_CONCURRENCY).flatMap(retentionPrefixes)
    const listings = await Promise.all(prefixes.map((prefix) => listAll(client, prefix, 'created_at')))
    listings.forEach((objects, position) => {
      for (const object of objects) {
        const writtenAt = Date.parse(object.updated_at ?? object.created_at ?? '')
        if (object.id && Number.isFinite(writtenAt) && writtenAt < cutoff) expired.push(`${prefixes[position]}/${object.name}`)
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
