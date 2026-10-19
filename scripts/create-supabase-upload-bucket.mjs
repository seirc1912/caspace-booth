import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL?.trim()
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
if (!url || !key) throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before running this script.')

const bucket = 'customer-photo-uploads'
const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
const existing = await client.storage.getBucket(bucket)
if (!existing.error) {
  if (existing.data.public) throw new Error(`Bucket ${bucket} exists but is public. Make it private before use.`)
  console.log(`Private bucket ${bucket} already exists; no change made.`)
  process.exit(0)
}

const created = await client.storage.createBucket(bucket, {
  public: false,
  allowedMimeTypes: ['image/png', 'image/jpeg'],
  fileSizeLimit: 25 * 1024 * 1024,
})
if (created.error) throw created.error
console.log(`Created private bucket ${bucket}.`)
