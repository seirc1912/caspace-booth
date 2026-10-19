import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import { customerPhotoBucket, objectPathForUpload, SupabasePhotoUploadService } from '../client/api/_lib/supabaseStorage.ts'
import { UploadApiError, type ApiRequest } from '../client/api/_lib/http.ts'
import { enforceUploadByteQuota, resetRateLimitsForTests } from '../client/api/_lib/rateLimit.ts'
import { hasValidImageSignature, normalizeVietnamesePhone as normalizeServerPhone, parseCompletionMetadata, parseUploadMetadata, sanitizeFilename } from '../client/api/_lib/uploadValidation.ts'
import { sha256Blob } from '../client/src/features/photoUpload/uploadClient.ts'
import { isValidVietnamesePhone, normalizeVietnamesePhone, snapshotSelectedFiles, validateSelectedFiles } from '../client/src/features/photoUpload/validation.ts'
import { parseStaffAllowlist } from '../client/api/_lib/staffAuth.ts'
import { originalFilename, requireCustomerObjectPath, requireCustomerPhone } from '../client/api/_lib/staffPhotos.ts'
import { updateCrc32 } from '../client/api/staff/photos/zip.ts'

const originalPng = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, ...Array.from({ length: 4096 }, (_, index) => index % 251)])
const pngPrefix = originalPng.subarray(0, 16).toString('base64')
const jpegPrefix = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46]).toString('base64')
const checksum = createHash('sha256').update(originalPng).digest('hex')
const environment = { url: 'https://project.supabase.co', serviceRoleKey: 'server-secret' }

function metadata(overrides: Record<string, unknown> = {}) {
  return parseUploadMetadata({ phone: '0901234567', filename: 'frame.png', mimeType: 'image/png', size: originalPng.length, prefix: pngPrefix, sha256: checksum, requestId: 'request_12345678', ...overrides })
}

function storageClient(options: { exists?: boolean; signedUrl?: string; error?: string } = {}) {
  const calls: Array<{ bucket: string; path: string; upsert?: boolean }> = []
  return {
    calls,
    client: {
      storage: {
        from(bucket: string) {
          return {
            async exists(path: string) { calls.push({ bucket, path }); return options.error ? { data: false, error: { message: options.error, status: 404 } } : { data: options.exists ?? false, error: null } },
            async createSignedUploadUrl(path: string, value: { upsert: boolean }) {
              calls.push({ bucket, path, upsert: value.upsert })
              return { data: { signedUrl: options.signedUrl ?? `https://project.supabase.co/storage/v1/object/upload/sign/${bucket}/${path}?token=signed` }, error: null }
            },
          }
        },
      },
    },
  }
}

function storedObject(body = originalPng, type = 'image/png') {
  return new Response(body, { status: 200, headers: { 'Content-Type': type, 'Content-Length': String(body.length) } })
}

test('Vietnamese phone numbers normalize consistently and reject invalid prefixes', () => {
  for (const value of ['090 123 4567', '+84 901 234 567', '84901234567']) {
    assert.equal(normalizeVietnamesePhone(value), '0901234567')
    assert.equal(normalizeServerPhone(value), '0901234567')
    assert.equal(isValidVietnamesePhone(value), true)
  }
  assert.equal(isValidVietnamesePhone('0201234567'), false)
  assert.equal(isValidVietnamesePhone('090123456'), false)
})

test('PNG and JPEG magic bytes must agree with MIME type and extension', () => {
  assert.equal(hasValidImageSignature(pngPrefix, 'image/png'), true)
  assert.equal(hasValidImageSignature(jpegPrefix, 'image/jpeg'), true)
  assert.equal(hasValidImageSignature(pngPrefix, 'image/jpeg'), false)
  assert.throws(() => metadata({ mimeType: 'image/jpeg' }), UploadApiError)
  assert.throws(() => metadata({ prefix: Buffer.from('not an image').toString('base64') }), UploadApiError)
})

test('selection and API limits enforce type, size, count, and total bytes', () => {
  assert.equal(validateSelectedFiles([{ name: 'one.png', type: 'image/png', size: 100 }, { name: 'two.jpg', type: 'image/jpeg', size: 200 }]), null)
  assert.match(validateSelectedFiles([{ name: 'bad.gif', type: 'image/gif', size: 100 }]) ?? '', /không phải ảnh/)
  assert.match(validateSelectedFiles([{ name: 'huge.png', type: 'image/png', size: 26 * 1024 * 1024 }]) ?? '', /25 MB/)
  assert.match(validateSelectedFiles(Array.from({ length: 21 }, (_, index) => ({ name: `${index}.png`, type: 'image/png', size: 1 }))) ?? '', /20 ảnh/)
  assert.match(validateSelectedFiles(Array.from({ length: 20 }, (_, index) => ({ name: `${index}.png`, type: 'image/png', size: 13 * 1024 * 1024 }))) ?? '', /250 MB/)
  assert.throws(() => metadata({ size: 26 * 1024 * 1024 }), UploadApiError)
})

test('first-load iOS selection snapshots the live FileList before the input is cleared', () => {
  const first = { name: 'first.png' }
  const second = { name: 'second.png' }
  const liveFileList: { 0?: typeof first; 1?: typeof second; length: number } = { 0: first, 1: second, length: 2 }
  const snapshot = snapshotSelectedFiles(liveFileList)

  liveFileList.length = 0
  delete liveFileList[0]
  delete liveFileList[1]

  assert.deepEqual(snapshot, [first, second])
})

test('filename sanitization removes path traversal and control characters', () => {
  assert.equal(sanitizeFilename('../folder/\u0000 portrait  01.png'), 'portrait 01.png')
  assert.throws(() => sanitizeFilename('../..'), UploadApiError)
})

test('SHA-256 of the browser upload Blob matches untouched original bytes', async () => {
  assert.equal(await sha256Blob(new Blob([originalPng])), checksum)
})

test('same phone groups files under one private prefix and distinct requests never collide', () => {
  const first = objectPathForUpload(metadata())
  const retry = objectPathForUpload(metadata())
  const second = objectPathForUpload(metadata({ requestId: 'request_87654321' }))
  assert.equal(first, retry)
  assert.match(first, /^0901234567\//)
  assert.notEqual(first, second)
  assert.equal(first.endsWith('.png'), true)
})

test('signed permission targets one exact object, disables overwrite, and exposes no read URL', async () => {
  const mock = storageClient({ error: 'Object not found' })
  const service = new SupabasePhotoUploadService(environment, mock.client)
  const result = await service.createSignedUpload(metadata())
  assert.equal(result.alreadyUploaded, false)
  assert.equal(mock.calls.every((call) => call.bucket === customerPhotoBucket), true)
  assert.equal(mock.calls.at(-1)?.upsert, false)
  assert.match(result.uploadUrl ?? '', /\/object\/upload\/sign\/customer-photo-uploads\//)
  assert.equal('downloadUrl' in result, false)
  assert.equal('serviceRoleKey' in result, false)
})

test('a missing object response from storage-js is the expected first-upload state', async () => {
  const mock = storageClient({ error: 'Object not found' })
  const service = new SupabasePhotoUploadService(environment, mock.client)
  const result = await service.createSignedUpload(metadata())
  assert.equal(result.alreadyUploaded, false)
  assert.equal(mock.calls.length, 2)
})

test('invalid signed-upload hosts are rejected', async () => {
  const mock = storageClient({ signedUrl: 'https://attacker.example/upload?token=bad' })
  const service = new SupabasePhotoUploadService(environment, mock.client)
  await assert.rejects(() => service.createSignedUpload(metadata()), UploadApiError)
})

test('completion streams and verifies stored size, MIME signature, and SHA-256', async () => {
  let requestHeaders: Headers | undefined
  const service = new SupabasePhotoUploadService(environment, storageClient().client, async (_url, init) => {
    requestHeaders = new Headers(init?.headers)
    return storedObject()
  })
  const result = await service.verifyUploadedObject(metadata(), objectPathForUpload(metadata()))
  assert.equal(result.sha256, checksum)
  assert.equal(result.size, originalPng.length)
  assert.equal(requestHeaders?.get('Authorization'), 'Bearer server-secret')
})

test('tampered bytes, wrong paths, and partial upload failures remain errors', async () => {
  const tampered = Buffer.from(originalPng)
  tampered[tampered.length - 1] ^= 1
  const service = new SupabasePhotoUploadService(environment, storageClient().client, async () => storedObject(tampered))
  await assert.rejects(() => service.verifyUploadedObject(metadata(), objectPathForUpload(metadata())), UploadApiError)
  await assert.rejects(() => service.verifyUploadedObject(metadata(), '0999999999/other.png'), UploadApiError)
  const unavailable = new SupabasePhotoUploadService(environment, storageClient().client, async () => new Response('unavailable', { status: 503 }))
  await assert.rejects(() => unavailable.verifyUploadedObject(metadata(), objectPathForUpload(metadata())), UploadApiError)
})

test('completed retry verifies and reuses its deterministic object without issuing a new upload URL', async () => {
  const mock = storageClient({ exists: true })
  const service = new SupabasePhotoUploadService(environment, mock.client, async () => storedObject())
  assert.deepEqual(await service.createSignedUpload(metadata()), { alreadyUploaded: true, objectPath: objectPathForUpload(metadata()) })
  assert.equal(mock.calls.length, 1)
})

test('completion metadata cannot redirect verification to an arbitrary object', () => {
  const value = { ...metadata(), objectPath: objectPathForUpload(metadata()) }
  assert.equal(parseCompletionMetadata(value).objectPath, objectPathForUpload(metadata()))
  assert.throws(() => parseCompletionMetadata({ ...value, objectPath: '../private/secret.png' }), UploadApiError)
})

test('per-IP byte quota rejects repeated large initialization attempts', () => {
  resetRateLimitsForTests()
  const request: ApiRequest = { headers: { 'x-forwarded-for': '203.0.113.8' } }
  enforceUploadByteQuota(request, 125 * 1024 * 1024)
  enforceUploadByteQuota(request, 125 * 1024 * 1024)
  assert.throws(() => enforceUploadByteQuota(request, 1), UploadApiError)
  resetRateLimitsForTests()
})

test('staff allowlist is normalized and never grants access when empty', () => {
  assert.deepEqual([...parseStaffAllowlist(' Staff@CaSpace.vn,owner@example.com ')], ['staff@caspace.vn', 'owner@example.com'])
  assert.equal(parseStaffAllowlist('').size, 0)
})

test('staff phone and object paths reject traversal and cross-customer access', () => {
  const phone = requireCustomerPhone('+84 901 234 567')
  assert.equal(phone, '0901234567')
  assert.equal(requireCustomerObjectPath(phone, '0901234567/photo--request_123.png'), '0901234567/photo--request_123.png')
  assert.throws(() => requireCustomerObjectPath(phone, '0999999999/photo.png'), UploadApiError)
  assert.throws(() => requireCustomerObjectPath(phone, '0901234567/../secret.png'), UploadApiError)
  assert.throws(() => requireCustomerPhone('not-a-phone'), UploadApiError)
})

test('staff display names remove only the collision-safe request suffix', () => {
  assert.equal(originalFilename('portrait--request_12345678.jpg'), 'portrait.jpg')
  assert.equal(originalFilename('family-photo.jpg'), 'family-photo.jpg')
})

test('streaming ZIP CRC32 matches the standard reference vector', () => {
  const crc = (updateCrc32(0xffffffff, Buffer.from('123456789')) ^ 0xffffffff) >>> 0
  assert.equal(crc, 0xcbf43926)
})
