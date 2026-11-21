import type { SupabaseClient } from '@supabase/supabase-js'
import { customerPhotoBucket, THUMBNAIL_FOLDER } from './supabaseStorage.js'

export const PHOTO_RETENTION_DAYS = 7
const PAGE = 1_000
const LIST_CONCURRENCY = 8

type Entry = { id: string | null; name: string; created_at: string | null }

async function listAll(client: SupabaseClient, prefix: string, sortColumn: 'name' | 'created_at') {
  const entries: Entry[] = []
  for (let offset = 0; ; offset += PAGE) {
    const page = await client.storage.from(customerPhotoBucket).list(prefix, { limit: PAGE, offset, sortBy: { column: sortColumn, order: 'asc' } })
    if (page.error) throw page.error
    entries.push(...(page.data as Entry[]))
    if (page.data.length < PAGE) return entries
  }
}

/**
 * Objects older than the cutoff in every customer folder and its `_thumbs/`
 * sub-folder. Paginates the root (the old script stopped at 1,000 folders).
 */
export async function listExpiredPhotoObjects(client: SupabaseClient, cutoff: number) {
  const expired: string[] = []
  const folders = (await listAll(client, '', 'name')).filter((entry) => entry.id === null).map((entry) => entry.name)
  // 8 folders at a time keeps the daily cron well inside maxDuration as the bucket grows.
  for (let index = 0; index < folders.length; index += LIST_CONCURRENCY) {
    const prefixes = folders.slice(index, index + LIST_CONCURRENCY).flatMap((folder) => [folder, `${folder}/${THUMBNAIL_FOLDER}`])
    const listings = await Promise.all(prefixes.map((prefix) => listAll(client, prefix, 'created_at')))
    listings.forEach((objects, position) => {
      for (const object of objects) if (object.id && object.created_at && Date.parse(object.created_at) < cutoff) expired.push(`${prefixes[position]}/${object.name}`)
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
