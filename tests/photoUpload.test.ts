import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { customerPhotoBucket, objectPathForUpload, SupabasePhotoUploadService } from '../client/api/_lib/supabaseStorage.ts'
import { UploadApiError, type ApiRequest } from '../client/api/_lib/http.ts'
import { CUSTOMER_UPLOAD_SESSION_BYTES, CUSTOMER_UPLOAD_SHARED_IP_BYTES, CUSTOMER_UPLOAD_WINDOW_MS, enforceCustomerUploadLimits, enforceRateLimit, enforceUploadByteQuota, resetRateLimitsForTests } from '../client/api/_lib/rateLimit.ts'
import { createUploadCompletionToken, createUploadSessionToken, verifyUploadCompletionToken, verifyUploadSessionToken } from '../client/api/_lib/uploadSession.ts'
import { hasValidImageSignature, normalizeVietnamesePhone as normalizeServerPhone, parseCompletionMetadata, parseUploadMetadata, sanitizeFilename } from '../client/api/_lib/uploadValidation.ts'
import { calculateOverallUploadProgress, recommendedUploadConcurrency, RESUMABLE_CHUNK_BYTES, RESUMABLE_UPLOAD_THRESHOLD_BYTES, runUploadQueue, sha256Blob } from '../client/src/features/photoUpload/uploadClient.ts'
import { isValidVietnamesePhone, normalizeVietnamesePhone, snapshotSelectedFiles, validateSelectedFiles } from '../client/src/features/photoUpload/validation.ts'
import { clearStaffSessionCookie, STAFF_PUBLIC_USERNAME, staffSessionCookie, staffSessionToken } from '../client/api/_lib/staffAuth.ts'
import { listCustomerFolders, normalizeFolderSearch, originalFilename, requireCustomerObjectPath, requireCustomerPhone } from '../client/api/_lib/staffPhotos.ts'
import { updateCrc32 } from '../client/api/staff/photos/zip.ts'
import { parseStaffLoginCredentials } from '../client/api/staff/login.ts'

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

test('customer upload progress is weighted by real file bytes and safely clamped', () => {
  assert.equal(calculateOverallUploadProgress([{ size: 1_000, uploadedBytes: 1_000 }, { size: 9_000, uploadedBytes: 0 }]), 10)
  assert.equal(calculateOverallUploadProgress([{ size: 1_000, uploadedBytes: 2_000 }, { size: 1_000, uploadedBytes: -5 }]), 50)
  assert.equal(calculateOverallUploadProgress([]), 0)
})

test('ready customer photos show no percentage or progress bar before submission', () => {
  const page = readFileSync(new URL('../client/src/pages/PhotoUploadPage.tsx', import.meta.url), 'utf8')
  assert.match(page, /photo\.state === 'uploading' \? `\$\{photo\.progress\}%` : 'Sẵn sàng'/)
  assert.match(page, /photo\.state === 'uploading' \? <div className="mt-2 h-1\.5/)
  assert.match(page, /\{uploading \? <div className="mt-5" aria-live="polite">/)
})

test('staff photo detail provides folder-list and homepage navigation', () => {
  const page = readFileSync(new URL('../client/src/pages/StaffPhotosPage.tsx', import.meta.url), 'utf8')
  assert.match(page, /← Quay lại danh sách/)
  assert.match(page, /<nav aria-label="Điều hướng nhân viên"[^>]*>/)
  assert.match(page, /<a[^>]+href="\/">Trang chủ<\/a>/)
  assert.match(page, /Trang chủ<\/a><button[^>]+onClick=\{logout\}[^>]*>Đăng xuất<\/button>/)
  assert.doesNotMatch(page, /<a[^>]+href="\/"[^>]+onClick=\{logout\}/)
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
  assert.equal(result.uploadToken, 'signed')
  assert.equal(result.resumableEndpoint, 'https://project.storage.supabase.co/storage/v1/upload/resumable')
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

test('signed upload sessions reject forgery, expiry, user-agent theft, and cross-session completion', () => {
  const secret = 'test-only-high-entropy-secret'
  const request: ApiRequest = { headers: { 'user-agent': 'Mobile Safari' } }
  const issuedAt = 1_800_000_000_000
  const token = createUploadSessionToken(request, secret, issuedAt)
  const signedRequest: ApiRequest = { headers: { ...request.headers, 'x-upload-session': token } }
  const sessionId = verifyUploadSessionToken(signedRequest, secret, issuedAt + 1_000)
  assert.ok(sessionId)
  assert.equal(verifyUploadSessionToken({ headers: { 'user-agent': 'Other', 'x-upload-session': token } }, secret, issuedAt + 1_000), null)
  assert.equal(verifyUploadSessionToken({ headers: { ...signedRequest.headers, 'x-upload-session': `${token.slice(0, -1)}x` } }, secret, issuedAt + 1_000), null)
  assert.equal(verifyUploadSessionToken(signedRequest, secret, issuedAt + 24 * 60 * 60_000 + 1), null)
  const completion = createUploadCompletionToken(secret, sessionId!, '0901234567/photo.png', checksum, originalPng.length)
  assert.equal(verifyUploadCompletionToken(secret, sessionId!, '0901234567/photo.png', checksum, originalPng.length, completion), true)
  assert.equal(verifyUploadCompletionToken(secret, 'other-session', '0901234567/photo.png', checksum, originalPng.length, completion), false)
  assert.equal(verifyUploadCompletionToken(secret, sessionId!, '0901234567/other.png', checksum, originalPng.length, completion), false)
})

test('shared-IP limits allow 1, 10, 20, and 30 legitimate customers without cross-blocking', () => {
  resetRateLimitsForTests()
  for (const customerCount of [1, 10, 20, 30]) {
    resetRateLimitsForTests()
    const ip = `203.0.113.${customerCount}`
    for (let customer = 0; customer < customerCount; customer += 1) {
      const sessionId = `session-${customer}`
      const request: ApiRequest = { headers: { 'x-forwarded-for': ip } }
      for (let file = 0; file < 6; file += 1) {
        const requestId = `customer-${customer}-file-${file}`
        enforceCustomerUploadLimits(request, 25 * 1024 * 1024, sessionId, requestId)
        enforceCustomerUploadLimits(request, 0, sessionId)
      }
    }
  }
  resetRateLimitsForTests()
})

test('1 GB session and 5 GB shared-IP ceilings are enforced across rotated signed sessions', () => {
  resetRateLimitsForTests()
  const request: ApiRequest = { headers: { 'x-forwarded-for': '203.0.113.90' } }
  enforceCustomerUploadLimits(request, CUSTOMER_UPLOAD_SESSION_BYTES, 'session-a', 'full-session')
  assert.throws(() => enforceCustomerUploadLimits(request, 1, 'session-a', 'over-session'), UploadApiError)
  resetRateLimitsForTests()
  for (let session = 0; session < 5; session += 1) {
    enforceCustomerUploadLimits(request, 1_000 * 1024 * 1024, `rotated-${session}`, `batch-${session}`)
  }
  assert.throws(() => enforceCustomerUploadLimits(request, 1, 'rotated-5', 'over-ip'), UploadApiError)
  assert.equal(CUSTOMER_UPLOAD_SHARED_IP_BYTES, 5_000 * 1024 * 1024)
  assert.equal(CUSTOMER_UPLOAD_WINDOW_MS, 10 * 60_000)
  resetRateLimitsForTests()
})

test('retries and resumable restarts reserve bytes once per session request', () => {
  resetRateLimitsForTests()
  const request: ApiRequest = { headers: { 'x-forwarded-for': '203.0.113.91' } }
  enforceCustomerUploadLimits(request, 600 * 1024 * 1024, 'session-retry', 'stable-request')
  enforceCustomerUploadLimits(request, 600 * 1024 * 1024, 'session-retry', 'stable-request')
  assert.throws(() => enforceCustomerUploadLimits(request, 500 * 1024 * 1024, 'session-retry', 'new-request'), UploadApiError)
  assert.throws(() => enforceCustomerUploadLimits(request, 601 * 1024 * 1024, 'session-retry', 'stable-request'), UploadApiError)
  resetRateLimitsForTests()
})

test('clients without a valid signed session keep the conservative fallback quota', () => {
  resetRateLimitsForTests()
  const request: ApiRequest = { headers: { 'x-forwarded-for': '203.0.113.26' } }
  enforceCustomerUploadLimits(request, 250 * 1024 * 1024, null)
  assert.throws(() => enforceCustomerUploadLimits(request, 1, null), UploadApiError)
  resetRateLimitsForTests()
})

test('upload queue caps concurrency and keeps processing after one file fails', async () => {
  let active = 0
  let peak = 0
  const completed: number[] = []
  const failures = await runUploadQueue([0, 1, 2, 3, 4], async (value) => {
    active += 1
    peak = Math.max(peak, active)
    await new Promise((resolve) => setTimeout(resolve, 2))
    active -= 1
    if (value === 2) throw new Error('expected failure')
    completed.push(value)
  }, 2)
  assert.equal(peak, 2)
  assert.deepEqual(failures.map(({ index }) => index), [2])
  assert.deepEqual(completed.sort(), [0, 1, 3, 4])
})

test('upload transport keeps slow networks sequential and uses Supabase-required TUS sizing', () => {
  assert.equal(recommendedUploadConcurrency({ saveData: true }), 1)
  assert.equal(recommendedUploadConcurrency({ effectiveType: '2g' }), 1)
  assert.equal(recommendedUploadConcurrency({ effectiveType: '4g' }), 2)
  assert.equal(recommendedUploadConcurrency(), 2)
  assert.equal(RESUMABLE_UPLOAD_THRESHOLD_BYTES, 6 * 1024 * 1024)
  assert.equal(RESUMABLE_CHUNK_BYTES, 6 * 1024 * 1024)
})

test('TUS uploads retain bounded retries and resume the previous upload fingerprint', () => {
  const source = readFileSync(new URL('../client/src/features/photoUpload/uploadClient.ts', import.meta.url), 'utf8')
  assert.match(source, /retryDelays:\s*\[0, 1_000, 3_000, 5_000, 10_000\]/)
  assert.match(source, /findPreviousUploads\(\)/)
  assert.match(source, /resumeFromPreviousUpload\(previous\[0\]\)/)
  assert.match(source, /removeFingerprintOnSuccess:\s*true/)
})

test('Vercel functions run near the Seoul Supabase project for verification', () => {
  const config = JSON.parse(readFileSync(new URL('../client/vercel.json', import.meta.url), 'utf8')) as { regions?: string[] }
  assert.deepEqual(config.regions, ['icn1'])
})

test('shared staff username is fixed and the session token is only accepted from its HttpOnly cookie', () => {
  assert.equal(STAFF_PUBLIC_USERNAME, 'caspace_staff')
  const cookie = staffSessionCookie('real-token', 3600)
  assert.match(cookie, /HttpOnly/)
  assert.match(cookie, /Secure/)
  assert.match(cookie, /SameSite=Strict/)
  assert.equal(staffSessionToken({ headers: { cookie: `other=value; ${cookie.split(';')[0]}` } }), 'real-token')
  assert.equal(staffSessionToken({ headers: { authorization: 'Bearer client-controlled' } }), undefined)
  assert.match(clearStaffSessionCookie(), /Max-Age=0/)
})

test('staff login attempts are rate limited independently of photo size quotas', () => {
  resetRateLimitsForTests()
  const request: ApiRequest = { headers: { 'x-forwarded-for': '203.0.113.12' } }
  for (let attempt = 0; attempt < 5; attempt += 1) enforceRateLimit(request, { limit: 5, windowMs: 15 * 60_000 })
  assert.throws(() => enforceRateLimit(request, { limit: 5, windowMs: 15 * 60_000 }), UploadApiError)
  resetRateLimitsForTests()
})

test('staff login accepts only the fixed username and forwards no client identity', () => {
  assert.deepEqual(parseStaffLoginCredentials({ username: 'caspace_staff', password: 'strong-private-value' }), { password: 'strong-private-value' })
  assert.throws(() => parseStaffLoginCredentials({ username: 'other_staff', password: 'strong-private-value' }), UploadApiError)
  assert.throws(() => parseStaffLoginCredentials({ username: 'caspace_staff', password: '' }), UploadApiError)
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

test('staff folder search accepts empty and partial Vietnamese phone numbers', () => {
  assert.equal(normalizeFolderSearch(''), '')
  assert.equal(normalizeFolderSearch('090 12'), '09012')
  assert.equal(normalizeFolderSearch('+84 90'), '090')
  assert.throws(() => normalizeFolderSearch('090<script>'), UploadApiError)
})

test('staff folder listing reads metadata only and sorts loaded folders by latest upload', async () => {
  const calls: Array<{ path: string; offset: number; search?: string }> = []
  const client = { storage: { from() { return { async list(path: string, options: { offset: number; search?: string }) {
    calls.push({ path, offset: options.offset, search: options.search })
    if (!path) return { data: [{ name: '0901234567' }, { name: '0912345678' }], error: null }
    if (path === '0901234567') return { data: [{ id: 'a', name: 'a.png', created_at: '2026-01-01T00:00:00Z' }], error: null }
    return { data: [{ id: 'b', name: 'b.jpg', created_at: '2026-02-01T00:00:00Z' }, { id: 'c', name: 'c.png', created_at: '2026-01-10T00:00:00Z' }], error: null }
  } } } } }
  const result = await listCustomerFolders(client as never, '09')
  assert.deepEqual(result.items.map((folder) => [folder.phone, folder.photoCount]), [['0912345678', 2], ['0901234567', 1]])
  assert.equal(calls[0]?.path, '')
  assert.equal(calls[0]?.search, '09')
})

test('staff dashboard automatically loads folders and keeps folder navigation controls', () => {
  const page = readFileSync(new URL('../client/src/pages/StaffPhotosPage.tsx', import.meta.url), 'utf8')
  assert.match(page, /listStaffPhotoFolders\(search\)/)
  assert.match(page, /Tải thêm thư mục/)
  assert.match(page, /← Quay lại danh sách/)
})

test('streaming ZIP CRC32 matches the standard reference vector', () => {
  const crc = (updateCrc32(0xffffffff, Buffer.from('123456789')) ^ 0xffffffff) >>> 0
  assert.equal(crc, 0xcbf43926)
})
