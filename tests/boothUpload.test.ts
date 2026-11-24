import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { UploadApiError } from '../client/api/_lib/http.ts'
import { requireBooth } from '../client/api/_lib/boothAuth.ts'
import { resetRateLimitsForTests } from '../client/api/_lib/rateLimit.ts'
import { boothOriginalPath, boothPreviewPath, boothThumbnailPath, parseBoothCompletion, parseBoothUploadMetadata, prepareBoothUpload, withContentSuffix } from '../client/api/_lib/boothPaths.ts'
import { isLocalDevelopmentUrl, resumableEndpoint, SupabasePhotoUploadService } from '../client/api/_lib/supabaseStorage.ts'

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 2, 3, 4, 5, 6, 7])
const prefix = jpeg.subarray(0, 16).toString('base64')
const sha = (value: Buffer | string) => createHash('sha256').update(value).digest('hex')
const keys = JSON.stringify({ 'booth-1': sha('secret-one'), 'booth-2': sha('secret-two') })
const environment = { url: 'https://project.supabase.co', serviceRoleKey: 'server-secret' }

const original = (overrides: Record<string, unknown> = {}) => parseBoothUploadMetadata({ phone: '0947860616', filename: '0947860616-103333.jpg', mimeType: 'image/jpeg', size: jpeg.length, prefix, sha256: sha(jpeg), variant: 'original', ...overrides })

test('booth keys are checked by SHA-256 hash and map to a booth id', () => {
  resetRateLimitsForTests()
  const request = (value?: string) => ({ headers: value ? { authorization: value } : {} })
  assert.deepEqual(requireBooth(request('Bearer secret-one'), { BOOTH_UPLOAD_KEYS: keys }), { boothId: 'booth-1' })
  assert.deepEqual(requireBooth(request('Bearer secret-two'), { BOOTH_UPLOAD_KEYS: keys }), { boothId: 'booth-2' })
  for (const value of [undefined, 'Bearer wrong', 'secret-one', 'Bearer ']) {
    assert.throws(() => requireBooth(request(value), { BOOTH_UPLOAD_KEYS: keys }), (error: unknown) => error instanceof UploadApiError && error.status === 401)
  }
  for (const env of [{}, { BOOTH_UPLOAD_KEYS: 'not json' }, { BOOTH_UPLOAD_KEYS: '{"bad id!":"x"}' }]) {
    assert.throws(() => requireBooth(request('Bearer secret-one'), env), (error: unknown) => error instanceof UploadApiError && error.status === 503)
  }
})

test('booth photos of every session of a phone share one folder', () => {
  assert.equal(boothOriginalPath('0947860616', '0947860616-103333.jpg'), '0947860616/_booth/0947860616-103333.jpg')
  assert.equal(boothThumbnailPath('0947860616/_booth/0947860616-103333.jpg'), '0947860616/_booth/_thumbs/0947860616-103333-thumb.jpg')
  assert.equal(withContentSuffix('0947860616/_booth/a.jpg', 'abcdef0123'.padEnd(64, '0')), '0947860616/_booth/a__abcdef01.jpg')
})

test('booth metadata accepts only JPEG and validates thumbnails against their original', () => {
  assert.equal(original().variant, 'original')
  assert.throws(() => original({ filename: 'x.png' }), UploadApiError)
  assert.throws(() => original({ mimeType: 'image/png' }), UploadApiError)
  assert.throws(() => original({ phone: '032648341' }), UploadApiError)
  assert.throws(() => original({ filename: '../../x.jpg', prefix: 'AAAA' }), UploadApiError)
  const thumb = parseBoothUploadMetadata({ ...original(), variant: 'thumbnail', size: 40_000, originalPath: '0947860616/_booth/0947860616-103333.jpg' })
  assert.equal(thumb.originalPath, '0947860616/_booth/0947860616-103333.jpg')
  assert.throws(() => parseBoothUploadMetadata({ ...original(), variant: 'thumbnail', size: 40_000, originalPath: '0999999999/_booth/a.jpg' }), UploadApiError)
  assert.throws(() => parseBoothUploadMetadata({ ...original(), variant: 'thumbnail', size: 40_000, originalPath: '0947860616/a.jpg' }), UploadApiError)
  assert.throws(() => parseBoothUploadMetadata({ ...original(), variant: 'thumbnail', size: 600_000, originalPath: '0947860616/_booth/a.jpg' }), UploadApiError)
  const completion = parseBoothCompletion({ ...original(), objectPath: '0947860616/_booth/0947860616-103333__abcdef01.jpg', completionToken: 't' })
  assert.equal(completion.objectPath, '0947860616/_booth/0947860616-103333__abcdef01.jpg')
  assert.throws(() => parseBoothCompletion({ ...original(), objectPath: '0947860616/other.jpg', completionToken: 't' }), UploadApiError)
})

function storage(objects: Record<string, Buffer>) {
  const signed: string[] = []
  const client = {
    storage: {
      from: (bucket: string) => ({
        exists: async (path: string) => ({ data: path in objects, error: path in objects ? null : { message: 'not found', status: 404 } }),
        createSignedUploadUrl: async (path: string) => { signed.push(path); return { data: { signedUrl: `https://project.supabase.co/storage/v1/object/upload/sign/${bucket}/${path}?token=t` }, error: null } },
      }),
    },
  }
  const fetchImpl = (async (url: string) => {
    const path = decodeURIComponent(String(url).split('/customer-photo-uploads/')[1] ?? '')
    const body = objects[path]
    return body ? new Response(body, { status: 200, headers: { 'Content-Type': 'image/jpeg' } }) : new Response('missing', { status: 404 })
  }) as typeof fetch
  return { signed, service: new SupabasePhotoUploadService(environment, client as never, fetchImpl) }
}

test('a new booth photo gets a signed upload at its plain path', async () => {
  const { service, signed } = storage({})
  const result = await prepareBoothUpload(service, original())
  assert.equal(result.alreadyUploaded, false)
  assert.equal(result.objectPath, '0947860616/_booth/0947860616-103333.jpg')
  assert.deepEqual(signed, ['0947860616/_booth/0947860616-103333.jpg'])
})

test('re-sending the same photo is idempotent; a different photo with the same name is kept beside it', async () => {
  const same = storage({ '0947860616/_booth/0947860616-103333.jpg': jpeg })
  assert.deepEqual(await prepareBoothUpload(same.service, original()), { alreadyUploaded: true, objectPath: '0947860616/_booth/0947860616-103333.jpg' })
  assert.equal(same.signed.length, 0)
  const other = Buffer.concat([jpeg, Buffer.from([9])])
  const clash = storage({ '0947860616/_booth/0947860616-103333.jpg': jpeg })
  const result = await prepareBoothUpload(clash.service, original({ size: other.length, sha256: sha(other) }))
  assert.equal(result.objectPath, `0947860616/_booth/0947860616-103333__${sha(other).slice(0, 8)}.jpg`)
  assert.equal(result.alreadyUploaded, false)
})

test('an existing booth thumbnail is reused without re-uploading', async () => {
  const { service, signed } = storage({ '0947860616/_booth/_thumbs/0947860616-103333-thumb.jpg': jpeg })
  const thumb = parseBoothUploadMetadata({ ...original(), filename: '0947860616-103333-thumb.jpg', variant: 'thumbnail', size: 40_000, originalPath: '0947860616/_booth/0947860616-103333.jpg' })
  assert.deepEqual(await prepareBoothUpload(service, thumb), { alreadyUploaded: true, objectPath: '0947860616/_booth/_thumbs/0947860616-103333-thumb.jpg' })
  assert.equal(signed.length, 0)
})

test('local Supabase over http is allowed only on private addresses', () => {
  assert.equal(isLocalDevelopmentUrl('http://127.0.0.1:54321'), true)
  assert.equal(isLocalDevelopmentUrl('http://10.211.55.2:54321'), true)
  assert.equal(isLocalDevelopmentUrl('http://192.168.1.20:54321'), true)
  assert.equal(isLocalDevelopmentUrl('http://project.supabase.co'), false)
  assert.equal(isLocalDevelopmentUrl('https://127.0.0.1'), false)
  assert.equal(resumableEndpoint('http://127.0.0.1:54321'), 'http://127.0.0.1:54321/storage/v1/upload/resumable/sign')
  assert.equal(resumableEndpoint('https://jmx.supabase.co'), 'https://jmx.storage.supabase.co/storage/v1/upload/resumable/sign')
})

test('booth endpoints authenticate the booth, skip same-origin, and never log paths or phones', () => {
  for (const file of ['client/api/booth/init.ts', 'client/api/booth/complete.ts']) {
    const source = readFileSync(file, 'utf8')
    assert.match(source, /requireBooth\(request\)/)
    assert.doesNotMatch(source, /enforceSameOrigin/)
    assert.match(source, /scope: 'booth-upload'/)
    assert.doesNotMatch(source, /console\.\w+\([^)]*(phone|objectPath|filename)/)
  }
})

test('20 wrong booth keys from one IP lock that IP out, even for the right key', () => {
  resetRateLimitsForTests()
  const from = (ip: string, key: string) => ({ headers: { authorization: `Bearer ${key}`, 'x-forwarded-for': ip } })
  for (let attempt = 0; attempt < 20; attempt += 1) assert.throws(() => requireBooth(from('198.51.100.7', `guess${attempt}xx`), { BOOTH_UPLOAD_KEYS: keys }), (error: unknown) => error instanceof UploadApiError && error.status === 401)
  assert.throws(() => requireBooth(from('198.51.100.7', 'secret-one'), { BOOTH_UPLOAD_KEYS: keys }), (error: unknown) => error instanceof UploadApiError && error.status === 429)
  assert.deepEqual(requireBooth(from('203.0.113.9', 'secret-one'), { BOOTH_UPLOAD_KEYS: keys }), { boothId: 'booth-1' }, 'other IPs (the shop) unaffected')
})

test('booth previews: 2 MB limit, stored under _previews, tied to their original', async () => {
  const preview = parseBoothUploadMetadata({ ...original(), filename: '0947860616-103333-preview.jpg', variant: 'preview', size: 300_000, originalPath: '0947860616/_booth/0947860616-103333.jpg' })
  assert.equal(boothPreviewPath(preview.originalPath!), '0947860616/_booth/_previews/0947860616-103333-preview.jpg')
  assert.throws(() => parseBoothUploadMetadata({ ...original(), variant: 'preview', size: 3 * 1024 * 1024, originalPath: '0947860616/_booth/0947860616-103333.jpg' }))
  assert.throws(() => parseBoothUploadMetadata({ ...original(), variant: 'preview', size: 300_000, originalPath: '0999999999/_booth/0947860616-103333.jpg' }))
  const { service } = storage({ '0947860616/_booth/_previews/0947860616-103333-preview.jpg': jpeg })
  assert.deepEqual(await prepareBoothUpload(service, preview), { alreadyUploaded: true, objectPath: '0947860616/_booth/_previews/0947860616-103333-preview.jpg' })
})
