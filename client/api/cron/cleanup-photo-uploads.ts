import { timingSafeEqual } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { header, type ApiRequest, type ApiResponse } from '../_lib/http.js'
import { BOOTH_RETENTION_HOURS, listExpiredPhotoObjects, PHOTO_RETENTION_DAYS, removePhotoObjects } from '../_lib/photoRetention.js'
import { loadSupabaseStorageEnvironment } from '../_lib/supabaseStorage.js'

export const config = { maxDuration: 300 }

// Hourly Vercel Cron (vercel.json). Deletes booth photos older than 12 hours and
// customer frames older than 3 days ONLY when PHOTO_UPLOAD_CLEANUP_ENABLED=true; otherwise it is a dry run that
// logs counts. Logs never contain phone numbers or object paths.
export function isAuthorizedCron(authorization: string | undefined, secret: string | undefined) {
  if (!secret || !authorization) return false
  const expected = Buffer.from(`Bearer ${secret}`)
  const actual = Buffer.from(authorization)
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

export default async function handler(request: ApiRequest, response: ApiResponse) {
  response.setHeader('Cache-Control', 'no-store')
  if (!isAuthorizedCron(header(request, 'authorization'), process.env.CRON_SECRET)) { response.status(401).json({ error: 'Unauthorized' }); return }
  const apply = process.env.PHOTO_UPLOAD_CLEANUP_ENABLED === 'true'
  try {
    const environment = loadSupabaseStorageEnvironment()
    const client = createClient(environment.url, environment.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
    const startedAt = Date.now()
    const { folders, expired } = await listExpiredPhotoObjects(client, startedAt - PHOTO_RETENTION_DAYS * 86_400_000, startedAt - BOOTH_RETENTION_HOURS * 3_600_000)
    const removed = apply ? await removePhotoObjects(client, expired) : 0
    const summary = { mode: apply ? 'apply' : 'dry-run', retentionDays: PHOTO_RETENTION_DAYS, boothRetentionHours: BOOTH_RETENTION_HOURS, folders, expired: expired.length, removed, durationMs: Date.now() - startedAt }
    console.info('[photo-cleanup]', summary)
    response.status(200).json(summary)
  } catch (reason) {
    console.error('[photo-cleanup] failed', { kind: reason instanceof Error ? reason.constructor.name : 'unknown' })
    response.status(500).json({ error: 'Cleanup failed' })
  }
}
