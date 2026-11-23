import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { classifyExport, phoneFromFolderName } from '../booth-agent/src/phoneFolder.ts'
import { UploadQueue } from '../booth-agent/src/queue.ts'
import { AUTOMATIC_RESCAN_MS, scanExports } from '../booth-agent/src/scanner.ts'
import { waitUntilStable } from '../booth-agent/src/stableFile.ts'
import { StateStore } from '../booth-agent/src/stateStore.ts'
import { renderStatusPage } from '../booth-agent/src/statusServer.ts'
import { AgentUploadError, uploadExport } from '../booth-agent/src/uploader.ts'

test('session folders map to a phone number; badly named folders are not guessed', () => {
  assert.equal(phoneFromFolderName('0947860616'), '0947860616')
  assert.equal(phoneFromFolderName('0947860616-1'), '0947860616')
  assert.equal(phoneFromFolderName('0856650134 tim'), '0856650134')
  for (const name of ['857 tim', 'tim', 'ly', 'nghii', '032648341', '.tmp.drivedownload', '0201234567']) assert.equal(phoneFromFolderName(name), null, name)
})

test('only <session>/Output/*.jpg exports are picked up (Windows paths)', () => {
  const root = 'C:\\Users\\ADMIN\\Pictures'
  const at = (relative: string) => classifyExport(`${root}\\${relative}`, root, path.win32)
  assert.deepEqual(at('0947860616-1\\Output\\0947860616-103333.jpg'), { kind: 'photo', phone: '0947860616', sessionFolder: '0947860616-1' })
  assert.deepEqual(at('tim\\Output\\a.JPEG'), { kind: 'unrecognized', sessionFolder: 'tim' })
  for (const ignored of ['0947860616\\Capture\\a.CR3', '0947860616\\Output\\a.png', '0947860616\\Output\\sub\\a.jpg', '0947860616\\Selects\\a.jpg', '.tmp.driveupload\\Output\\a.jpg', '0947860616\\Output\\.a.jpg', 'a.jpg']) {
    assert.equal(at(ignored), null, ignored)
  }
})

test('a file still being written is not uploaded until its size stops changing', async () => {
  const sizes = [100, 2_000, 4_000, 4_000, 4_000, 4_000]
  let reads = 0
  const size = await waitUntilStable('x.jpg', { statImpl: async () => ({ size: sizes[Math.min(reads++, sizes.length - 1)]! }), sleep: async () => {} })
  assert.equal(size, 4_000)
  assert.ok(reads >= 6, 'needs three unchanged checks after growth')
  await assert.rejects(() => waitUntilStable('x.jpg', { statImpl: async () => ({ size: reads++ }), sleep: async () => {}, timeoutMs: 10, intervalMs: 1 }), /FILE_NOT_STABLE/)
})

function fakeApi(options: { alreadyUploaded?: boolean; failFirst?: number; status?: number } = {}) {
  const calls: Array<{ url: string; body?: Record<string, unknown> }> = []
  let failures = options.failFirst ?? 0
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) as Record<string, unknown> : undefined
    calls.push({ url: String(url), body })
    if (failures > 0) { failures -= 1; if (options.status) return new Response(JSON.stringify({ error: 'nope' }), { status: options.status }); throw new TypeError('fetch failed') }
    if (String(url).endsWith('/api/booth/init')) {
      const objectPath = body!.variant === 'thumbnail' ? '0947860616/_booth/_thumbs/a-thumb.jpg' : '0947860616/_booth/a.jpg'
      return Response.json({ alreadyUploaded: options.alreadyUploaded ?? false, objectPath, uploadUrl: options.alreadyUploaded ? undefined : 'http://storage/upload', completionToken: 't' })
    }
    return Response.json({ ok: true })
  }) as typeof fetch
  return { calls, api: { baseUrl: 'http://api', key: 'k'.repeat(20), fetchImpl } }
}
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13])

test('an export is sent as original then thumbnail, with init → PUT → complete each', async () => {
  const { calls, api } = fakeApi()
  const result = await uploadExport({ api, phone: '0947860616', filePath: '/p/0947860616/Output/a.jpg', bytes: jpeg, makeThumbnail: async () => jpeg })
  assert.equal(result.objectPath, '0947860616/_booth/a.jpg')
  assert.deepEqual(calls.map((call) => call.url), ['http://api/api/booth/init', 'http://storage/upload', 'http://api/api/booth/complete', 'http://api/api/booth/init', 'http://storage/upload', 'http://api/api/booth/complete'])
  assert.equal(calls[3]!.body!.originalPath, '0947860616/_booth/a.jpg')
  assert.equal(calls[3]!.body!.filename, 'a-thumb.jpg')
  const again = fakeApi({ alreadyUploaded: true })
  await uploadExport({ api: again.api, phone: '0947860616', filePath: '/p/a.jpg', bytes: jpeg, makeThumbnail: async () => jpeg })
  assert.ok(!again.calls.some((call) => call.url === 'http://storage/upload'), 'already uploaded → no PUT')
})

function tempState() { return new StateStore(path.join(mkdtempSync(path.join(tmpdir(), 'booth-state-')), 'uploaded.json')) }
const job = { filePath: '/p/0947860616/Output/a.jpg', phone: '0947860616', sessionFolder: '0947860616' }
const fileDeps = { waitStable: async () => 1, statImpl: async () => ({ size: jpeg.length, mtimeMs: 1 }), readImpl: async () => jpeg, makeThumbnail: async () => jpeg, sleep: async () => {} }

test('network outages are retried until they succeed, then the file is never re-sent', async () => {
  const { api, calls } = fakeApi({ failFirst: 4 })
  const state = tempState()
  const queue = new UploadQueue({ api, state, ...fileDeps })
  queue.enqueue(job)
  await queue.idle()
  assert.equal(queue.uploadedCount, 1)
  const before = calls.length
  queue.enqueue(job)
  await queue.idle()
  assert.equal(calls.length, before, 'same path + size + mtime → skipped after restart-equivalent')
  assert.equal(new StateStore((state as unknown as { file: string }).file).size, 1, 'state persisted to disk')
})

test('a rejected file (4xx) gives up after 3 attempts instead of looping forever', async () => {
  const { api } = fakeApi({ failFirst: 99, status: 409 })
  const queue = new UploadQueue({ api, state: tempState(), ...fileDeps })
  queue.enqueue(job)
  await queue.idle()
  assert.equal(queue.uploadedCount, 0)
  assert.match(queue.failures.get(job.filePath) ?? '', /nope/)
  assert.ok(new AgentUploadError('x', 409, false))
})

test('startup scan only covers the last 24 hours; manual resend covers any age', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'pictures-'))
  const put = (relative: string, ageMs: number) => {
    const file = path.join(root, relative)
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, jpeg)
    const time = (Date.now() - ageMs) / 1000
    utimesSync(file, time, time)
  }
  put('0947860616/Output/new.jpg', 60_000)
  put('0947860616/Output/old.jpg', 3 * AUTOMATIC_RESCAN_MS)
  put('0947860616/Capture/raw.CR3', 0)
  put('tim/Output/x.jpg', 0)
  put('.tmp.drivedownload/Output/y.jpg', 0)
  const recent = await scanExports(root, { sinceMs: Date.now() - AUTOMATIC_RESCAN_MS })
  assert.deepEqual(recent.jobs.map((item) => path.basename(item.filePath)), ['new.jpg'])
  assert.deepEqual(recent.unrecognized, ['tim'])
  const manual = await scanExports(root, { onlyFolder: '0947860616' })
  assert.deepEqual(manual.jobs.map((item) => path.basename(item.filePath)).sort(), ['new.jpg', 'old.jpg'])
})

test('forgetting one folder does not forget a sibling with the same phone prefix', () => {
  const state = tempState()
  state.mark(StateStore.key('/p/0947860616/Output/a.jpg', 1, 1), 'x')
  state.mark(StateStore.key('/p/0947860616-1/Output/a.jpg', 1, 1), 'y')
  state.forgetFolder(`/p/0947860616${path.sep}`)
  assert.equal(state.size, 1)
})

test('status page escapes folder names', () => {
  const html = renderStatusPage({ boothId: 'booth-1', watchRoot: 'C:\\P', apiBaseUrl: 'http://x', pending: 2, uploaded: 5, lastError: null, unrecognized: ['<script>'], failures: [] })
  assert.ok(!html.includes('<script>'))
  assert.match(html, /Gửi lại thư mục/)
})
