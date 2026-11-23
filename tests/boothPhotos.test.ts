import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { listBoothPhotos } from '../client/api/_lib/boothPhotos.ts'
import { loadBoothPhotoFiles, type BoothPhoto } from '../client/src/features/boothPhotos/boothPhotosClient.ts'

const now = Date.parse('2026-11-23T12:00:00Z')
const ago = (ms: number) => new Date(now - ms).toISOString()
const HOUR = 60 * 60_000

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
  assert.match(composer, /if \(boothPool\.length\) \{ setAutoFillDialogOpen\(false\); withPoolFiles\(boothPool, \(files\) => onAutoFillPhotos\?\.\(files\)\); return \}/)
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

test('ticking a photo prefetches its original once; continuing reuses it', async () => {
  const { createBoothPhotoLoader } = await import('../client/src/features/boothPhotos/boothPhotosClient.ts')
  const fetched: string[] = []
  const loader = createBoothPhotoLoader((async (url: string) => { fetched.push(String(url)); return new Response(new Uint8Array([1]), { status: 200 }) }) as typeof fetch)
  const photo: BoothPhoto = { id: 'a', name: 'a.jpg', thumbUrl: null, originalUrl: 'o/a', uploadedAt: ago(HOUR) }
  loader.prefetch(photo)
  const files = await loadBoothPhotoFiles([photo], undefined, fetch, loader)
  assert.equal(files[0]!.name, 'a.jpg')
  assert.deepEqual(fetched, ['o/a'], 'downloaded once')
  assert.match(readFileSync('client/src/CustomerApp.tsx', 'utf8'), /forEach\(boothLoader\.prefetch\)/)
})

test('multi-photo frames label empty slots "Hình N" and the sheet says which photo goes where', () => {
  assert.match(readFileSync('client/src/components/editor/TemplateCanvas.tsx', 'utf8'), /slotLabel=\{template\.slots\.length > 1 \? `Hình \$\{index \+ 1\}` : undefined\}/)
  const sheet = readFileSync('client/src/components/editor/BoothPoolSheet.tsx', 'utf8')
  assert.match(sheet, /`→ Hình \$\{target\}`/)
  assert.match(sheet, /Ảnh chọn trước vào hình trước/)
})

test('tapping an empty slot lets the customer pick several booth photos: tapped slot first, then the other empty slots', async () => {
  const { assignPhotosToFrameTarget, createFramePhotoTarget } = await import('../client/src/features/photos/framePhotoTarget.ts')
  const composer = readFileSync('client/src/pages/ComposerPage.tsx', 'utf8')
  assert.match(composer, /emptySlotIndices: \[slotIndex, \.\.\.frameTarget\.emptySlotIndices\.filter\(\(index\) => index !== slotIndex\)\]/)
  const target = createFramePhotoTarget('t', [null, null, null])
  const reordered = { ...target, emptySlotIndices: [1, 0, 2] }
  const photo = (id: string) => ({ id, src: `blob:${id}`, alt: id, source: 'selfbooth' as const })
  const next = assignPhotosToFrameTarget({}, reordered, [photo('a'), photo('b')])
  assert.deepEqual(next.t!.map((slot) => slot?.photo.id ?? null), ['b', 'a', null], 'first pick → tapped Hình 2, second → Hình 1')
})

test('photos the customer uploaded via /upload-anh are offered too; exported frames (caspace-…) are not', async () => {
  const byPrefix: Record<string, Array<{ id: string | null; name: string; created_at: string | null }>> = {
    '0906314807/_booth': [photo('0906314807-100001.jpg', 2 * HOUR)],
    '0906314807': [
      { id: null, name: '_booth', created_at: null }, { id: null, name: '_thumbs', created_at: null },
      photo('IMG_1234--req_12345678-0.jpg', HOUR), photo('selfie--req_12345678-1.png', HOUR),
      photo('caspace-20261124-004137-khung1--abc12345-f1.jpg', HOUR),
    ],
  }
  const bucket = {
    list: async (prefix: string) => ({ data: byPrefix[prefix] ?? [], error: null }),
    download: async () => ({ data: null, error: { message: 'missing' } }),
    createSignedUrls: async (paths: string[]) => ({ data: paths.map((path) => ({ path, signedUrl: `https://signed/${path}`, error: null })), error: null }),
  }
  const result = await listBoothPhotos({ storage: { from: () => bucket } } as never, '0906314807', now)
  assert.equal(result.status, 'ok')
  assert.deepEqual(result.photos.map((item) => [item.id, item.name]), [
    ['0906314807-100001.jpg', '0906314807-100001.jpg'],
    ['upload:IMG_1234--req_12345678-0.jpg', 'IMG_1234.jpg'],
    ['upload:selfie--req_12345678-1.png', 'selfie.png'],
  ])
  assert.equal(result.photos[1]!.thumbUrl, 'https://signed/0906314807/_thumbs/IMG_1234--req_12345678-0-thumb.jpg')
  const onlyUploads = await listBoothPhotos({ storage: { from: () => ({ ...bucket, list: async (prefix: string) => ({ data: prefix === '0906314807' ? [photo('a--req_12345678-0.jpg', HOUR)] : [], error: null }) }) } } as never, '0906314807', now)
  assert.equal(onlyUploads.photos.length, 1, 'customer uploads alone open the picker')
  const old = await listBoothPhotos({ storage: { from: () => ({ ...bucket, list: async (prefix: string) => ({ data: prefix === '0906314807' ? [photo('a--req_12345678-0.jpg', 50 * HOUR)] : [], error: null }) }) } } as never, '0906314807')
  assert.equal(old.status, 'ok', 'no viewing window: visible until the 3-day cleanup')
})

test('"DÙNG N ẢNH" opens the editor at once; originals finish downloading in the background', async () => {
  const app = readFileSync('client/src/CustomerApp.tsx', 'utf8')
  const apply = app.slice(app.indexOf('const applyBoothPhotoSelection'), app.indexOf("navigate('/editor')", app.indexOf('const applyBoothPhotoSelection')))
  assert.doesNotMatch(apply, /await /, 'no download is awaited before navigating')
  assert.match(app, /file: null,\s+ready: boothLoader \? boothLoader\.load\(photo\)/)
  const composer = readFileSync('client/src/pages/ComposerPage.tsx', 'utf8')
  assert.match(composer, /Đang tải ảnh phòng chụp \$\{poolReady\}\/\$\{boothPool\.length\}…/)
  const { readyPoolFiles } = await import('../client/src/features/boothPhotos/boothPhotosClient.ts')
  const file = new File([new Uint8Array([1])], 'a.jpg')
  const files = await readyPoolFiles([{ id: 'a', thumbUrl: null, file: null, ready: Promise.resolve(file) }, { id: 'b', thumbUrl: null, file: null, ready: Promise.reject(new Error('net')) }])
  assert.deepEqual(files, [file], 'one failed download does not block the others')
})

test('saving several photos uses one share sheet, or one download per file when sharing is unavailable', async () => {
  const { deliverImageFiles } = await import('../client/src/features/orders/services/saveComposition.ts')
  const files = [new File([new Uint8Array([1])], 'a.jpg', { type: 'image/jpeg' }), new File([new Uint8Array([2])], 'b.jpg', { type: 'image/jpeg' })]
  const shared: ShareData[] = []
  assert.equal(await deliverImageFiles(files, { navigator: { canShare: () => true, share: async (data) => { shared.push(data) } }, download: () => assert.fail('no download when sharing works') }), 'shared')
  assert.equal(shared[0]!.files!.length, 2, 'one share sheet for all photos')
  const downloaded: string[] = []
  assert.equal(await deliverImageFiles(files, { navigator: {}, download: (_blob, name) => downloaded.push(name) }), 'downloaded')
  assert.deepEqual(downloaded, ['a.jpg', 'b.jpg'])
  assert.equal(await deliverImageFiles(files, { navigator: { canShare: () => true, share: async () => { throw Object.assign(new Error('x'), { name: 'AbortError' }) } }, download: () => assert.fail() }), 'cancelled')
})

test('picker: ⤢ or double tap opens the full-screen viewer with previous/next; download button for ticked photos', () => {
  const picker = readFileSync('client/src/pages/BoothPhotoPickerPage.tsx', 'utf8')
  assert.match(picker, /aria-label=\{`Xem lớn ảnh \$\{index \+ 1\}`\}/)
  assert.match(picker, /if \(double\) setViewerIndex\(index\)/)
  assert.match(picker, /`⬇ Lưu \$\{batchPrefix\} vào máy`/)
  const viewer = readFileSync('client/src/components/booth/BoothPhotoViewer.tsx', 'utf8')
  assert.match(viewer, /aria-label="Ảnh trước"/)
  assert.match(viewer, /aria-label="Ảnh sau"/)
  assert.match(viewer, /if \(Math\.abs\(dx\) > 50\) go\(dx < 0 \? 1 : -1\)/, 'swipe left/right')
})

test('Android/desktop download originals directly; only iPhone/iPad use the share sheet', async () => {
  const { boothDownloadUrl, downloadBoothPhotos, prefersShareSheet } = await import('../client/src/features/boothPhotos/boothPhotosClient.ts')
  assert.equal(prefersShareSheet('Mozilla/5.0 (Linux; Android 14; 23078PND5G) Chrome/131 Mobile', 5), false)
  assert.equal(prefersShareSheet('Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X)', 5), true)
  assert.equal(prefersShareSheet('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari', 5), true, 'iPadOS reports Macintosh')
  assert.equal(prefersShareSheet('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome', 0), false)
  assert.equal(boothDownloadUrl({ originalUrl: 'https://x.supabase.co/storage/v1/object/sign/b/p/a.jpg?token=t', name: 'IMG 1.jpg' }), 'https://x.supabase.co/storage/v1/object/sign/b/p/a.jpg?token=t&download=IMG+1.jpg')
  const clicked: string[] = []
  await downloadBoothPhotos([{ originalUrl: 'https://s/o/a?token=1', name: 'a.jpg' }, { originalUrl: 'https://s/o/b?token=2', name: 'b.jpg' }], 0, (href) => clicked.push(href))
  assert.deepEqual(clicked, ['https://s/o/a?token=1&download=a.jpg', 'https://s/o/b?token=2&download=b.jpg'])
})

test('no viewing window: photos stay visible until the 3-day cleanup deletes them', async () => {
  assert.deepEqual(await listBoothPhotos(fakeClient([]).client, '0947860616'), { status: 'unavailable', photos: [] })
  const twoDaysOld = await listBoothPhotos(fakeClient([photo('a.jpg', 48 * HOUR)]).client, '0947860616')
  assert.equal(twoDaysOld.status, 'ok')
  assert.equal(twoDaysOld.photos.length, 1)
  assert.ok(!('viewableUntil' in twoDaysOld))
  assert.doesNotMatch(readFileSync('client/src/pages/BoothPhotoPickerPage.tsx', 'utf8'), /Xem được đến/)
})

test('downloads go in batches of at most 20 photos, one tap per batch', async () => {
  const { chunk, DOWNLOAD_BATCH } = await import('../client/src/features/boothPhotos/boothPhotosClient.ts')
  assert.equal(DOWNLOAD_BATCH, 20)
  assert.deepEqual(chunk(Array.from({ length: 45 }, (_, index) => index), 20).map((batch) => batch.length), [20, 20, 5])
  assert.deepEqual(chunk([1, 2, 3], 20), [[1, 2, 3]])
  const picker = readFileSync('client/src/pages/BoothPhotoPickerPage.tsx', 'utf8')
  assert.match(picker, /const batches = chunk\(selectedPhotos, DOWNLOAD_BATCH\)/)
  assert.match(picker, /`đợt \$\{nextBatch \+ 1\}\/\$\{batches\.length\} \(\$\{currentBatch\.length\} ảnh\)`/)
  assert.match(picker, /if \(await download\(currentBatch\)\) setBatchState/)
})
