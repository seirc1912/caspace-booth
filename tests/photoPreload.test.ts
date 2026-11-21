import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { forgetPhoto, photoSource, photoThumbnail, preloadPhoto, PRELOAD_BUDGET_BYTES, releasePreload, resetPreloadForTests } from '../client/src/features/photoUpload/preload.ts'

const file = (name: string, size: number) => new File([new Uint8Array(size)], name, { type: 'image/jpeg' })

test('picked photos are read one at a time and reused at upload time', async () => {
  resetPreloadForTests()
  const order: string[] = []
  let active = 0
  let maxActive = 0
  const read = async (input: File) => {
    active += 1; maxActive = Math.max(maxActive, active); order.push(input.name)
    await new Promise((resolve) => setTimeout(resolve, 5))
    active -= 1
    return new File([await input.arrayBuffer()], input.name, { type: input.type })
  }
  const a = file('a.jpg', 10)
  const b = file('b.jpg', 10)
  const first = preloadPhoto(a, read)!
  const second = preloadPhoto(b, read)!
  assert.equal(preloadPhoto(a, read), first, 'same file → same read')
  await Promise.all([first, second])
  assert.deepEqual(order, ['a.jpg', 'b.jpg'])
  assert.equal(maxActive, 1, 'sequential reads')
  assert.equal(photoSource(a, read), first, 'upload reuses the preloaded copy')
})

test('preloading stays within the memory budget and frees on release', async () => {
  resetPreloadForTests()
  const read = async (input: File) => input
  const big = { name: 'big.jpg', size: PRELOAD_BUDGET_BYTES - 10, type: 'image/jpeg' } as File
  const other = { name: 'other.jpg', size: 20, type: 'image/jpeg' } as File
  assert.ok(preloadPhoto(big, read))
  assert.equal(preloadPhoto(other, read), null, 'over budget → read at upload time instead')
  let freshReads = 0
  await photoSource(other, async (input) => { freshReads += 1; return input })
  assert.equal(freshReads, 1)
  releasePreload(big)
  assert.ok(preloadPhoto(other, read), 'budget is returned after release')
})

test('upload page preloads on pick, shows a preparing state and releases memory', () => {
  const page = readFileSync(new URL('../client/src/pages/PhotoUploadPage.tsx', import.meta.url), 'utf8')
  assert.match(page, /for \(const file of selectedFiles\) \{\n\s+void preloadPhoto\(file\)/)
  assert.match(page, /source,\n\s+onPrepared: \(\) => markPrepared\(photo\.file\)/)
  assert.match(page, /'ĐANG CHUẨN BỊ ẢNH…'/)
  assert.match(page, /forgetPhoto\(removed\.file\)/)
  assert.match(page, /\.finally\(\(\) => releasePreload\(photo\.file\)\)/)
  const client = readFileSync(new URL('../client/src/features/photoUpload/uploadClient.ts', import.meta.url), 'utf8')
  assert.match(client, /await \(input\.source \?\? inMemoryFile\(input\.file\)\)/)
})

test('upload page asks for photos first, then the phone number', () => {
  const page = readFileSync(new URL('../client/src/pages/PhotoUploadPage.tsx', import.meta.url), 'utf8')
  const picker = page.indexOf('1. Chọn ảnh cần in')
  const phone = page.indexOf('2. Số điện thoại nhận ảnh')
  assert.ok(picker > 0 && phone > picker, 'photo picker is above the phone field')
  assert.ok(page.indexOf('+ CHỌN ẢNH PNG / JPG') < page.indexOf('id="upload-phone"'))
  assert.match(page, /if \(!validPhone\) window\.setTimeout\(\(\) => phoneRef\.current\?\.focus\(\), 0\)/)
})

test('previews are small thumbnails made once from the in-memory copy, in the same queue', async () => {
  resetPreloadForTests()
  const events: string[] = []
  const read = async (input: File) => { events.push(`read:${input.name}`); return new File([await input.arrayBuffer()], `mem-${input.name}`, { type: input.type }) }
  const make = async (input: File) => { events.push(`thumb:${input.name}`); return new File([new Uint8Array(4)], 'thumb.jpg', { type: 'image/jpeg' }) }
  const a = file('a.jpg', 10)
  const b = file('b.jpg', 10)
  void preloadPhoto(a, read); const thumbA = photoThumbnail(a, make)
  void preloadPhoto(b, read); const thumbB = photoThumbnail(b, make)
  assert.equal(photoThumbnail(a, make), thumbA, 'made once, reused for the staff thumbnail upload')
  await Promise.all([thumbA, thumbB])
  assert.deepEqual(events, ['read:a.jpg', 'thumb:mem-a.jpg', 'read:b.jpg', 'thumb:mem-b.jpg'])
  forgetPhoto(a)
  assert.notEqual(photoThumbnail(a, make), thumbA, 'forgotten photos are not kept')
  assert.equal(await photoThumbnail(file('bad.jpg', 1), async () => { throw new Error('decode') }), null, 'decode failure → null, never throws')
})

test('upload page never renders the full-size original as a preview', () => {
  const page = readFileSync(new URL('../client/src/pages/PhotoUploadPage.tsx', import.meta.url), 'utf8')
  assert.match(page, /previewUrl: null, prepared: false/)
  assert.match(page, /URL\.createObjectURL\(thumbnail \?\? file\)/)
  assert.match(page, /thumbnail: photoThumbnail\(photo\.file\)/)
})
