import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL?.trim()
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
if (!url || !key) throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before running this script.')

const bucket = 'customer-photo-uploads'
const RETENTION_DAYS = 3
const apply = process.argv.includes('--apply')
const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000
const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
async function listAll(prefix, column) {
  const entries = []
  for (let offset = 0; ; offset += 1_000) {
    const page = await client.storage.from(bucket).list(prefix, { limit: 1_000, offset, sortBy: { column, order: 'asc' } })
    if (page.error) throw page.error
    entries.push(...page.data)
    if (page.data.length < 1_000) return entries
  }
}

// Same prefixes and age rule as the daily cron (client/api/_lib/photoRetention.ts).
const expired = []
for (const folder of (await listAll('', 'name')).filter((entry) => entry.id === null).map((entry) => entry.name)) {
  for (const prefix of [folder, `${folder}/_thumbs`, `${folder}/_booth`, `${folder}/_booth/_thumbs`]) {
    for (const object of await listAll(prefix, 'created_at')) {
      const writtenAt = Date.parse(object.updated_at ?? object.created_at ?? '')
      if (object.id && Number.isFinite(writtenAt) && writtenAt < cutoff) expired.push(`${prefix}/${object.name}`)
    }
  }
}

console.log(`${apply ? 'Deleting' : 'Dry run:'} ${expired.length} object(s) older than ${RETENTION_DAYS} days.`)
for (let index = 0; index < expired.length; index += 100) {
  const batch = expired.slice(index, index + 100)
  if (apply) {
    const removed = await client.storage.from(bucket).remove(batch)
    if (removed.error) throw removed.error
  }
}
if (!apply) console.log('Nothing was deleted. Re-run with --apply only after explicit approval.')
