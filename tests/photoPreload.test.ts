import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { photoSource, preloadPhoto, PRELOAD_BUDGET_BYTES, releasePreload, resetPreloadForTests } from '../client/src/features/photoUpload/preload.ts'

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
  assert.match(page, /for \(const file of selectedFiles\) void preloadPhoto\(file\)/)
  assert.match(page, /source,\n\s+onPrepared: \(\) => markPrepared\(photo\.file\)/)
  assert.match(page, /'ĐANG CHUẨN BỊ ẢNH…'/)
  assert.match(page, /releasePreload\(removed\.file\)/)
  assert.match(page, /\.finally\(\(\) => releasePreload\(photo\.file\)\)/)
  const client = readFileSync(new URL('../client/src/features/photoUpload/uploadClient.ts', import.meta.url), 'utf8')
  assert.match(client, /await \(input\.source \?\? inMemoryFile\(input\.file\)\)/)
})
