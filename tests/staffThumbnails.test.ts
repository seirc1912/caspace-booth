import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { UploadApiError } from '../client/api/_lib/http.ts'
import { listCustomerPhotos } from '../client/api/_lib/staffPhotos.ts'
import { objectPathForUpload, thumbnailPathFor } from '../client/api/_lib/supabaseStorage.ts'
import { MAX_THUMBNAIL_BYTES, parseCompletionMetadata, parseUploadMetadata } from '../client/api/_lib/uploadValidation.ts'
import { thumbnailFilename, thumbnailSize } from '../client/src/features/photoUpload/thumbnail.ts'

const jpegPrefix = Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...Array.from({ length: 12 }, () => 0)]).toString('base64')
const pngPrefix = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, ...Array.from({ length: 8 }, () => 0)]).toString('base64')
const sha = 'a'.repeat(64)
const thumb = (overrides: Record<string, unknown> = {}) => parseUploadMetadata({ phone: '0901234567', filename: 'Khung 1.jpg', mimeType: 'image/jpeg', size: 40_000, prefix: jpegPrefix, sha256: sha, requestId: 'request_12345678-0-thumb', variant: 'thumbnail', ...overrides })

test('thumbnail object path matches the path staff derive from the original', () => {
  const original = parseUploadMetadata({ phone: '0901234567', filename: 'Khung 1.png', mimeType: 'image/png', size: 4_000_000, prefix: pngPrefix, sha256: sha, requestId: 'request_12345678-0' })
  assert.equal(original.variant, 'original')
  const originalPath = objectPathForUpload(original)
  assert.equal(originalPath, '0901234567/Khung 1--request_12345678-0.png')
  assert.equal(objectPathForUpload(thumb({ filename: thumbnailFilename('Khung 1.png') })), thumbnailPathFor(originalPath))
  assert.equal(thumbnailPathFor(originalPath), '0901234567/_thumbs/Khung 1--request_12345678-0-thumb.jpg')
})

test('thumbnail uploads are restricted to small JPEGs with a -thumb request id', () => {
  assert.equal(thumb().variant, 'thumbnail')
  const rejects = (overrides: Record<string, unknown>) => assert.throws(() => thumb(overrides), UploadApiError)
  rejects({ size: MAX_THUMBNAIL_BYTES + 1 })
  rejects({ requestId: 'request_12345678-0' })
  rejects({ mimeType: 'image/png', filename: 'Khung 1.png', prefix: pngPrefix })
  rejects({ variant: 'other' })
  const completion = parseCompletionMetadata({ phone: '0901234567', filename: 'Khung 1.jpg', mimeType: 'image/jpeg', size: 40_000, prefix: jpegPrefix, sha256: sha, requestId: 'request_12345678-0-thumb', variant: 'thumbnail', objectPath: '0901234567/_thumbs/Khung 1--request_12345678-0-thumb.jpg' })
  assert.equal(completion.objectPath, objectPathForUpload(completion))
  assert.throws(() => parseCompletionMetadata({ ...completion, objectPath: '0901234567/a/b/c.jpg' }), UploadApiError)
})

test('staff listing signs thumbnails and originals without Image Transformations', async () => {
  const calls: Array<{ method: string; args: unknown[] }> = []
  const bucket = {
    list: async () => ({ error: null, data: [
      { id: '1', name: 'Khung 1--request_12345678-0.png', created_at: '2026-11-21T01:00:00Z', metadata: { size: 4_000_000 } },
      { id: '2', name: 'Cu--request_00000000-1.png', created_at: '2026-11-20T01:00:00Z', metadata: { size: 3_000_000 } },
      { id: null, name: '_thumbs', created_at: null, metadata: null },
    ] }),
    createSignedUrls: async (paths: string[], expires: number, ...rest: unknown[]) => {
      calls.push({ method: 'createSignedUrls', args: [paths, expires, ...rest] })
      return { error: null, data: paths.map((path) => path.includes('Cu--') && path.includes('_thumbs') ? { path, signedUrl: null, error: 'Object not found' } : { path, signedUrl: `https://signed/${path}`, error: null }) }
    },
    createSignedUrl: async (...args: unknown[]) => { calls.push({ method: 'createSignedUrl', args }); return { data: null, error: null } },
  }
  const client = { storage: { from: () => bucket } } as never
  const listed = await listCustomerPhotos(client, '0901234567')
  assert.equal(listed.items.length, 2, '_thumbs folder is not counted as a photo')
  assert.equal(listed.items[0]!.previewUrl, 'https://signed/0901234567/_thumbs/Khung 1--request_12345678-0-thumb.jpg')
  assert.equal(listed.items[0]!.originalUrl, 'https://signed/0901234567/Khung 1--request_12345678-0.png')
  assert.equal(listed.items[1]!.previewUrl, null, 'older photo without thumbnail → placeholder')
  assert.ok(listed.items[1]!.originalUrl)
  assert.ok(calls.every((call) => call.method === 'createSignedUrls' && call.args.length === 2), 'no transform options, no per-file signing')
  const zipped = await listCustomerPhotos(client, '0901234567', 0, 1_000, { signUrls: false })
  assert.equal(zipped.items.length, 2)
  assert.equal(calls.length, 2, 'ZIP listing does not sign preview URLs')
})

test('no staff or upload API code requests Supabase Image Transformations', () => {
  for (const file of ['../client/api/_lib/staffPhotos.ts', '../client/api/staff/photos/zip.ts', '../client/api/staff/photos/index.ts']) {
    assert.doesNotMatch(readFileSync(new URL(file, import.meta.url), 'utf8'), /transform\s*:|render\/image/)
  }
})

test('thumbnail helpers keep aspect ratio and naming', () => {
  assert.deepEqual(thumbnailSize(1500, 3500), { width: 171, height: 400 })
  assert.deepEqual(thumbnailSize(3000, 2000), { width: 400, height: 267 })
  assert.deepEqual(thumbnailSize(200, 100), { width: 200, height: 100 })
  assert.equal(thumbnailFilename('Khung 1.png'), 'Khung 1.jpg')
  assert.equal(thumbnailFilename('a.b.jpeg'), 'a.b.jpg')
})

test('thumbnail and preview failures are not reported as customer upload failures', () => {
  const source = readFileSync(new URL('../client/src/features/photoUpload/uploadClient.ts', import.meta.url), 'utf8')
  assert.match(source, /if \(variant !== 'original'\) silentCorrelationIds\.add\(correlationId\)/)
  assert.match(source, /if \(silentCorrelationIds\.has\(diagnostic\.correlationId\)\) return/)
})
