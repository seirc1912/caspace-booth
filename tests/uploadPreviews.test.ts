import assert from 'node:assert/strict'
import test from 'node:test'
import { parseUploadMetadata } from '../client/api/_lib/uploadValidation.ts'
import { objectPathForUpload, previewPathFor, thumbnailPathFor } from '../client/api/_lib/supabaseStorage.ts'
import { queueThumbnailUpload } from '../client/src/features/photoUpload/thumbnail.ts'

const jpegPrefix = Buffer.from([0xff, 0xd8, 0xff, 0xe0]).toString('base64')
const meta = (overrides: Record<string, unknown>) => ({ phone: '0906341807', filename: 'IMG 1.jpg', mimeType: 'image/jpeg', size: 300_000, prefix: jpegPrefix, sha256: 'a'.repeat(64), requestId: 'sub12345-0', ...overrides })

test('a preview upload lands at the path the photo list looks for', () => {
  const original = objectPathForUpload(parseUploadMetadata(meta({ filename: 'IMG 1.png', mimeType: 'image/png', prefix: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).toString('base64') })))
  const preview = objectPathForUpload(parseUploadMetadata(meta({ requestId: 'sub12345-0-preview', variant: 'preview' })))
  const thumb = objectPathForUpload(parseUploadMetadata(meta({ requestId: 'sub12345-0-thumb', variant: 'thumbnail' })))
  assert.equal(preview, previewPathFor(original))
  assert.equal(preview, '0906341807/_previews/IMG 1--sub12345-0-preview.jpg')
  assert.equal(thumb, thumbnailPathFor(original))
})

test('previews must be JPEG, at most 2 MB, with a -preview request id', () => {
  assert.throws(() => parseUploadMetadata(meta({ requestId: 'sub12345-0-preview', variant: 'preview', size: 2 * 1024 * 1024 + 1 })), /Ảnh xem trước không hợp lệ/)
  assert.throws(() => parseUploadMetadata(meta({ requestId: 'sub12345-0', variant: 'preview' })), /Ảnh xem trước không hợp lệ/)
  assert.throws(() => parseUploadMetadata(meta({ variant: 'other' })), /không hợp lệ/)
})

test('the upload page sends thumbnail then preview; a failed preview never breaks anything', async () => {
  const calls: Array<{ variant?: string; requestId: string }> = []
  const file = new File([new Uint8Array([1])], 'IMG 1.png', { type: 'image/png' })
  const tiny = new File([new Uint8Array([2])], 'IMG 1.jpg', { type: 'image/jpeg' })
  const upload = async (input: { variant?: string; requestId: string }) => { calls.push({ variant: input.variant, requestId: input.requestId }); return {} as never }
  await queueThumbnailUpload({ file, thumbnail: Promise.resolve(tiny), phone: '0906341807', requestId: 'sub12345-0', preview: true }, { upload: upload as never, makePreview: async () => tiny })
  assert.deepEqual(calls, [{ variant: 'thumbnail', requestId: 'sub12345-0-thumb' }, { variant: 'preview', requestId: 'sub12345-0-preview' }])
  calls.length = 0
  await queueThumbnailUpload({ file, thumbnail: Promise.resolve(tiny), phone: '0906341807', requestId: 'sub12345-1', preview: true }, { upload: upload as never, makePreview: async () => { throw new Error('decode') } })
  assert.deepEqual(calls.map((call) => call.variant), ['thumbnail'])
  calls.length = 0
  await queueThumbnailUpload({ file, thumbnail: Promise.resolve(tiny), phone: '0906341807', requestId: 'sub12345-2' }, { upload: upload as never })
  assert.deepEqual(calls.map((call) => call.variant), ['thumbnail'], 'frames sent for printing get no preview')
})
