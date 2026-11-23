import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { BOOTH_VIEW_WINDOW_MS, boothViewableUntil, listBoothPhotos } from '../client/api/_lib/boothPhotos.ts'
import { loadBoothPhotoFiles, type BoothPhoto } from '../client/src/features/boothPhotos/boothPhotosClient.ts'

const now = Date.parse('2026-11-23T12:00:00Z')
const ago = (ms: number) => new Date(now - ms).toISOString()
const HOUR = 60 * 60_000

test('booth photos are viewable for 6 hours after the newest upload or a staff reopen', () => {
  assert.equal(BOOTH_VIEW_WINDOW_MS, 6 * HOUR)
  assert.equal(boothViewableUntil(ago(HOUR), null), now + 5 * HOUR)
  assert.equal(boothViewableUntil(ago(10 * HOUR), ago(HOUR)), now + 5 * HOUR, 'reopen gives exactly 6 h from the click')
  assert.equal(boothViewableUntil(null, null), null)
})

function fakeClient(entries: Array<{ id: string | null; name: string; created_at: string | null }>, access?: string) {
  const signCalls: unknown[][] = []
  const bucket = {
    list: async (prefix: string) => ({ data: prefix === '0947860616/_booth' ? entries : [], error: null }),
    download: async () => (access ? { data: new Blob([access]), error: null } : { data: null, error: { message: 'not found' } }),
    createSignedUrls: async (...args: unknown[]) => {
      signCalls.push(args)
      const paths = args[0] as string[]
      return { data: paths.map((path) => ({ path, signedUrl: `https://signed/${path}`, error: null })), error: null }
    },
  }
  return { signCalls, client: { storage: { from: () => bucket } } as never }
}
const photo = (name: string, age: number) => ({ id: name, name, created_at: ago(age) })

test('listing returns thumbnails + originals inside the window, without Image Transformations', async () => {
  const { client, signCalls } = fakeClient([photo('0947860616-1.jpg', 2 * HOUR), photo('0947860616-2.jpg', HOUR), { id: null, name: '_thumbs', created_at: null }, photo('_access.json', HOUR)])
  const result = await listBoothPhotos(client, '0947860616', now)
  assert.equal(result.status, 'ok')
  assert.deepEqual(result.photos.map((item) => item.id), ['0947860616-1.jpg', '0947860616-2.jpg'])
  assert.equal(result.photos[0]!.thumbUrl, 'https://signed/0947860616/_booth/_thumbs/0947860616-1-thumb.jpg')
  assert.equal(result.photos[0]!.originalUrl, 'https://signed/0947860616/_booth/0947860616-1.jpg')
  assert.ok(signCalls.every((args) => args.length === 2), 'plain signed URLs, no transform options')
})

test('no photos and expired photos give the same empty answer', async () => {
  assert.deepEqual(await listBoothPhotos(fakeClient([]).client, '0947860616', now), { status: 'unavailable', photos: [] })
  const expired = await listBoothPhotos(fakeClient([photo('a.jpg', 6 * HOUR + 60_000)]).client, '0947860616', now)
  assert.deepEqual(expired, { status: 'unavailable', photos: [] })
  const reopened = await listBoothPhotos(fakeClient([photo('a.jpg', 30 * HOUR), photo('_access.json', HOUR)], JSON.stringify({ reopenedAt: ago(HOUR) })).client, '0947860616', now)
  assert.equal(reopened.status, 'ok')
})

test('only the ticked photos are downloaded, at most two at a time', async () => {
  let active = 0
  let peak = 0
  const fetched: string[] = []
  const fetchImpl = (async (url: string) => {
    active += 1; peak = Math.max(peak, active); fetched.push(String(url))
    await new Promise((resolve) => setTimeout(resolve, 5))
    active -= 1
    return new Response(new Uint8Array([0xff, 0xd8, 0xff]), { status: 200 })
  }) as typeof fetch
  const photos: BoothPhoto[] = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id, name: `${id}.jpg`, thumbUrl: `t/${id}`, originalUrl: `o/${id}`, uploadedAt: ago(HOUR) }))
  const files = await loadBoothPhotoFiles(photos.slice(0, 3), undefined, fetchImpl)
  assert.deepEqual(fetched.sort(), ['o/a', 'o/b', 'o/c'])
  assert.ok(peak <= 2)
  assert.deepEqual(files.map((file) => [file.name, file.type]), [['a.jpg', 'image/jpeg'], ['b.jpg', 'image/jpeg'], ['c.jpg', 'image/jpeg']])
})

test('customer endpoint needs a signed browser session and same origin', () => {
  const source = readFileSync('client/api/booth-photos/list.ts', 'utf8')
  assert.match(source, /enforceSameOrigin\(request\)/)
  assert.match(source, /verifyUploadSessionToken/)
  assert.match(source, /requireCustomerPhone/)
  assert.doesNotMatch(source, /console\.\w+\([^)]*phone/)
})

test('entering a room opens the booth picker when photos exist; the old Supabase RPC session is gone', () => {
  const app = readFileSync('client/src/CustomerApp.tsx', 'utf8')
  assert.doesNotMatch(app, /useSessionPhotos|startPhotoLibrarySession/)
  assert.match(app, /navigate\(hasBoothPhotos \? '\/booth-photos' : '\/editor'\)/)
  assert.match(app, /createCustomerSession\(boothId, booth\.phoneNumber\)/)
  const composer = readFileSync('client/src/pages/ComposerPage.tsx', 'utf8')
  assert.match(composer, /if \(boothPool\.length\) \{ setAutoFillDialogOpen\(false\); onAutoFillPhotos\?\.\(boothPool\.map/)
  const picker = readFileSync('client/src/pages/BoothPhotoPickerPage.tsx', 'utf8')
  assert.match(picker, /loading="lazy" src=\{photo\.thumbUrl\}/, 'grid only loads thumbnails')
  assert.doesNotMatch(picker, /originalUrl/)
})

test('one browser session may look up at most 3 different phone numbers per 10 minutes', async () => {
  const { enforceDistinctLimit, resetRateLimitsForTests } = await import('../client/api/_lib/rateLimit.ts')
  resetRateLimitsForTests()
  const t = Date.parse('2026-11-23T00:00:00Z')
  for (const phone of ['0901', '0902', '0903']) enforceDistinctLimit('s', phone, 3, 600_000, t)
  for (let poll = 0; poll < 50; poll += 1) enforceDistinctLimit('s', '0901', 3, 600_000, t + poll * 10_000)
  assert.throws(() => enforceDistinctLimit('s', '0904', 3, 600_000, t + 1_000), /quá nhiều số điện thoại/)
  enforceDistinctLimit('s', '0904', 3, 600_000, t + 600_001 + 500_000)
  const source = readFileSync('client/api/booth-photos/list.ts', 'utf8')
  assert.match(source, /enforceDistinctLimit\(`booth-session:\$\{sessionId\}`, phone, 3/)
})
