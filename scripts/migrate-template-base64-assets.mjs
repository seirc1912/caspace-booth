#!/usr/bin/env node
/**
 * Resumable one-time template asset migration. Dry-run is the default.
 * This script never deletes rows or objects and updates editor_data only when
 * the source updated_at still matches the value that was inspected.
 * Applying supabase/migrations/20260829110000_template_base64_migration_tool.sql
 * is required before using --apply; the normal performance deployment does not
 * install or depend on that write RPC.
 */
import { createClient } from '@supabase/supabase-js'

const apply = process.argv.includes('--apply')
const url = process.env.CASPACE_SUPABASE_URL
const key = process.env.CASPACE_SUPABASE_PUBLISHABLE_KEY
const adminToken = process.env.CASPACE_ADMIN_TOKEN
if (!url || !key || !adminToken) {
  throw new Error('Set CASPACE_SUPABASE_URL, CASPACE_SUPABASE_PUBLISHABLE_KEY, and CASPACE_ADMIN_TOKEN. Secret values are never printed.')
}
if (!apply) console.log('DRY RUN: no uploads or database updates will be performed. Pass --apply explicitly to migrate.')

const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
const isDataImage = (value) => typeof value === 'string' && /^data:image\/[a-z0-9.+-]+;base64,/i.test(value)
const extension = (mime) => mime === 'image/svg+xml' ? 'svg' : (mime.split('/')[1] || 'bin').replace('jpeg', 'jpg')

function collect(value, path = [], result = []) {
  if (isDataImage(value)) result.push({ path, value })
  else if (Array.isArray(value)) value.forEach((item, index) => collect(item, [...path, index], result))
  else if (value && typeof value === 'object') Object.entries(value).forEach(([key, item]) => collect(item, [...path, key], result))
  return result
}

function replaceAt(root, path, value) {
  let cursor = root
  for (const key of path.slice(0, -1)) cursor = cursor[key]
  cursor[path.at(-1)] = value
}

const { data: summaries, error: summaryError } = await supabase.rpc('admin_templates_summary', { p_token: adminToken })
if (summaryError) throw summaryError
const report = []

for (const summary of summaries) {
  try {
    const { data: detail, error } = await supabase.rpc('admin_template_detail', { p_token: adminToken, p_id: summary.id })
    if (error) throw error
    const assets = collect(detail.editor_data)
    if (!assets.length) { report.push({ id: summary.id, status: 'already-clean', assets: 0 }); continue }
    if (!apply) { report.push({ id: summary.id, status: 'would-migrate', assets: assets.length }); continue }

    const nextEditorData = structuredClone(detail.editor_data)
    for (const [index, asset] of assets.entries()) {
      const response = await fetch(asset.value)
      if (!response.ok) throw new Error(`Asset ${index + 1} could not be decoded`)
      const blob = await response.blob()
      const path = `${summary.id}/migration-${index}-${crypto.randomUUID()}.${extension(blob.type)}`
      const uploaded = await supabase.storage.from('template-assets').upload(path, blob, {
        contentType: blob.type, upsert: false, metadata: { adminToken },
      })
      if (uploaded.error) throw uploaded.error
      const publicUrl = supabase.storage.from('template-assets').getPublicUrl(path).data.publicUrl
      replaceAt(nextEditorData, asset.path, publicUrl)
    }

    const updated = await supabase.rpc('admin_replace_template_editor_data_if_unchanged', {
      p_token: adminToken, p_id: summary.id, p_expected_updated_at: detail.updated_at, p_editor_data: nextEditorData,
    })
    if (updated.error) throw updated.error
    const verified = await supabase.rpc('admin_template_detail', { p_token: adminToken, p_id: summary.id })
    if (verified.error || collect(verified.data.editor_data).length) throw verified.error ?? new Error('Post-update verification failed')
    report.push({ id: summary.id, status: 'migrated', assets: assets.length })
  } catch (error) {
    report.push({ id: summary.id, status: 'failed-unchanged-or-concurrency-protected', error: error instanceof Error ? error.message : String(error) })
  }
}

console.table(report)
