import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL?.trim()
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
if (!url || !key) throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before running this script.')

const bucket = 'customer-photo-uploads'
const apply = process.argv.includes('--apply')
const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000
const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
const root = await client.storage.from(bucket).list('', { limit: 1_000 })
if (root.error) throw root.error

const expired = []
for (const prefix of root.data.filter((entry) => entry.id === null).map((entry) => entry.name)) {
  let offset = 0
  while (true) {
    const page = await client.storage.from(bucket).list(prefix, { limit: 1_000, offset, sortBy: { column: 'created_at', order: 'asc' } })
    if (page.error) throw page.error
    for (const object of page.data) {
      if (object.id && object.created_at && Date.parse(object.created_at) < cutoff) expired.push(`${prefix}/${object.name}`)
    }
    if (page.data.length < 1_000) break
    offset += page.data.length
  }
}

console.log(`${apply ? 'Deleting' : 'Dry run:'} ${expired.length} object(s) older than 7 days.`)
for (let index = 0; index < expired.length; index += 100) {
  const batch = expired.slice(index, index + 100)
  if (apply) {
    const removed = await client.storage.from(bucket).remove(batch)
    if (removed.error) throw removed.error
  } else {
    for (const path of batch) console.log(path)
  }
}
if (!apply) console.log('Nothing was deleted. Re-run with --apply only after explicit approval.')
