import { timingSafeEqual } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { header, type ApiRequest, type ApiResponse } from '../_lib/http.js'
import { BOOTH_RETENTION_HOURS, listExpiredPhotoObjects, removePhotoObjects, UPLOAD_RETENTION_HOURS } from '../_lib/photoRetention.js'
import { applyPrintOrderCleanup, planPrintOrderCleanup, PRINT_ORDER_RETENTION_HOURS, supabasePrintOrderStore } from '../_lib/printOrderRetention.js'
import { loadSupabaseStorageEnvironment } from '../_lib/supabaseStorage.js'

export const config = { maxDuration: 300 }

// Hourly Vercel Cron (vercel.json). Deletes booth photos older than 6 hours and
// customer uploads older than 6 hours, and print orders (rows + frames in `print-orders`) sent more
// than 6 hours ago whatever their status, ONLY when PHOTO_UPLOAD_CLEANUP_ENABLED=true; otherwise it is a dry run that
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
    const { folders, expired } = await listExpiredPhotoObjects(client, startedAt - UPLOAD_RETENTION_HOURS * 3_600_000, startedAt - BOOTH_RETENTION_HOURS * 3_600_000)
    const removed = apply ? await removePhotoObjects(client, expired) : 0
    // A print-queue failure must not hide the photo cleanup that already ran: report it separately.
    let printPlan = { files: [] as string[], orders: [] as string[] }
    let printRemoved = { removedFiles: 0, removedOrders: 0 }
    let printError: string | null = null
    try {
      const printStore = supabasePrintOrderStore(client)
      printPlan = await planPrintOrderCleanup(client, printStore, startedAt - PRINT_ORDER_RETENTION_HOURS * 3_600_000)
      if (apply) printRemoved = await applyPrintOrderCleanup(client, printStore, printPlan)
    } catch (reason) { printError = reason instanceof Error ? reason.constructor.name : 'unknown' }
    const summary = {
      mode: apply ? 'apply' : 'dry-run', uploadRetentionHours: UPLOAD_RETENTION_HOURS, boothRetentionHours: BOOTH_RETENTION_HOURS, folders, expired: expired.length, removed,
      printOrderRetentionHours: PRINT_ORDER_RETENTION_HOURS, printOrdersExpired: printPlan.orders.length, printFilesExpired: printPlan.files.length, ...printRemoved, printError,
      durationMs: Date.now() - startedAt,
    }
    console.info('[photo-cleanup]', summary)
    response.status(200).json(summary)
  } catch (reason) {
    console.error('[photo-cleanup] failed', { kind: reason instanceof Error ? reason.constructor.name : 'unknown' })
    response.status(500).json({ error: 'Cleanup failed' })
  }
}
