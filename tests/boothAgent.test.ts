import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { classifyExport, phoneFromFolderName } from '../booth-agent/src/phoneFolder.ts'
import { UploadQueue } from '../booth-agent/src/queue.ts'
import { AUTOMATIC_RESCAN_MS, isOnOrAfterUploadFrom, scanExports, UPLOAD_FROM_MS } from '../booth-agent/src/scanner.ts'
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
      const objectPath = body!.variant === 'thumbnail' ? '0947860616/_booth/_thumbs/a-thumb.jpg' : body!.variant === 'preview' ? '0947860616/_booth/_previews/a-preview.jpg' : '0947860616/_booth/a.jpg'
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
  assert.ok(!again.calls.some((call) => call.url.endsWith('/complete')), 'already stored → nothing to verify (a re-made thumbnail may differ by a few bytes)')
})

test('with a preview maker, the 1600px preview follows the thumbnail', async () => {
  const { calls, api } = fakeApi()
  await uploadExport({ api, phone: '0947860616', filePath: '/p/0947860616/Output/a.jpg', bytes: jpeg, makeThumbnail: async () => jpeg, makePreview: async () => jpeg })
  const inits = calls.filter((call) => call.url === 'http://api/api/booth/init').map((call) => [call.body!.variant, call.body!.filename, call.body!.originalPath ?? null])
  assert.deepEqual(inits, [['original', 'a.jpg', null], ['thumbnail', 'a-thumb.jpg', '0947860616/_booth/a.jpg'], ['preview', 'a-preview.jpg', '0947860616/_booth/a.jpg']])
})

test('a server without preview support (400) does not fail the export', async () => {
  const { api } = fakeApi()
  const fetchImpl = api.fetchImpl
  const strict = { ...api, fetchImpl: (async (url: string, init?: RequestInit) => {
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) as Record<string, unknown> : undefined
    if (body?.variant === 'preview') return new Response(JSON.stringify({ error: 'Thông tin ảnh phòng chụp không hợp lệ.' }), { status: 400 })
    return fetchImpl(url, init)
  }) as typeof fetch }
  const result = await uploadExport({ api: strict, phone: '0947860616', filePath: '/p/0947860616/Output/a.jpg', bytes: jpeg, makeThumbnail: async () => jpeg, makePreview: async () => jpeg })
  assert.equal(result.objectPath, '0947860616/_booth/a.jpg')
})

test('state keys from before previews existed are not treated as done (backfill after update)', () => {
  assert.notEqual(StateStore.key('/p/a.jpg', 10, 1), '/p/a.jpg|10|1')
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
  const recent = await scanExports(root, { sinceMs: Date.now() - AUTOMATIC_RESCAN_MS, notBeforeMs: 0 })
  assert.deepEqual(recent.jobs.map((item) => path.basename(item.filePath)), ['new.jpg'])
  assert.deepEqual(recent.unrecognized, ['tim'])
  const manual = await scanExports(root, { onlyFolder: '0947860616', notBeforeMs: 0 })
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

test('status page only answers loopback Host headers and embeds the CSRF token', async () => {
  const { isLocalHost } = await import('../booth-agent/src/statusServer.ts')
  assert.equal(isLocalHost('127.0.0.1:47821', 47821), true)
  assert.equal(isLocalHost('localhost:47821', 47821), true)
  for (const host of ['evil.example:47821', '127.0.0.1:80', undefined]) assert.equal(isLocalHost(host, 47821), false)
  const html = renderStatusPage({ boothId: 'b', watchRoot: 'r', apiBaseUrl: 'a', pending: 0, uploaded: 0, lastError: null, unrecognized: [], failures: [] }, '', 'tok123')
  assert.match(html, /name="token" value="tok123"/)
})

test('Setup.exe pieces: config writer keeps old values on upgrade and rejects bad input', async () => {
  const { execFileSync, spawnSync } = await import('node:child_process')
  const { mkdtempSync: mk, readFileSync: read } = await import('node:fs')
  const dir = mk(path.join(tmpdir(), 'setup-'))
  const file = path.join(dir, 'config.json')
  const script = 'booth-agent/installer/write-config.mjs'
  assert.equal(spawnSync('node', [script, file, 'booth-2', 'abc1234', 'https://caspace.vn', dir]).status, 12, '7 characters is too short')
  assert.equal(spawnSync('node', [script, file, 'booth-2', 'k'.repeat(24), 'ftp://x', dir]).status, 10)
  assert.equal(spawnSync('node', [script, file, 'booth-2', 'k'.repeat(24), 'https://caspace.vn', path.join(dir, 'missing')]).status, 13)
  assert.equal(spawnSync('node', [script, file, 'booth-2', 'k'.repeat(24), 'https://caspace.vn', dir]).stdout.length, 0, 'no text output for NSIS to garble')
  execFileSync('node', [script, file, 'booth-2', 'k'.repeat(24), 'https://caspace.vn/', dir])
  execFileSync('node', [script, file, '', '', '', ''])
  assert.deepEqual(JSON.parse(read(file, 'utf8')), { apiBaseUrl: 'https://caspace.vn', boothId: 'booth-2', boothKey: 'k'.repeat(24), watchRoot: dir, concurrency: 4, statusPort: 47821 })
  const task = read('booth-agent/installer/task.xml', 'utf8')
  assert.match(task, /<RestartOnFailure><Interval>PT1M<\/Interval><Count>999<\/Count><\/RestartOnFailure>/)
  assert.match(task, /<LogonTrigger>/)
  assert.match(task, /<RunLevel>LeastPrivilege<\/RunLevel>/, 'agent never runs elevated')
  const nsi = read('booth-agent/installer/installer.nsi', 'utf8')
  assert.match(nsi, /\$\{NSD_CreatePassword\}/, 'key typed into a password box, never baked into the .exe')
  assert.match(nsi, /Function ConfigPageLeave[\s\S]*\$\{If\} \$0 < 8/, 'key length (8) checked on the input page')
  assert.match(nsi, /NSD_CreateCheckbox[^\n]*"Hiện mã"/)
  assert.match(nsi, /EM_SETPASSWORDCHAR\} 0 0/, 'checkbox reveals the key')
  const { execFileSync: ex } = await import('node:child_process')
  const keys = ex('node', ['booth-agent/scripts/make-keys.mjs', 'booth-1', 'booth-2'], { encoding: 'utf8' })
  const generated = [...keys.matchAll(/booth-\d: (\S+)/g)].map((match) => match[1]!)
  assert.equal(generated.length, 2)
  assert.ok(generated.every((key) => /^[a-hjkmnp-z2-9]{8}$/.test(key)), 'readable 8-character keys')
  assert.match(nsi, /InstallDir "\$PROGRAMFILES64\\CaspaceBooth"/)
  assert.ok(nsi.indexOf("/setowner") < nsi.indexOf("File /r"), "folder locked before files are copied or run")
})

test('a wrong server address is explained in Vietnamese and keeps retrying', async () => {
  const api = { baseUrl: 'https://caspace.vn', key: 'k'.repeat(8), fetchImpl: (async () => new Response('<html>', { status: 405 })) as typeof fetch }
  await assert.rejects(() => uploadExport({ api, phone: '0912345678', filePath: '/p/a.jpg', bytes: jpeg, makeThumbnail: async () => jpeg }), (error: unknown) => error instanceof AgentUploadError && error.retryable && /Sai địa chỉ máy chủ.*https:\/\/caspace\.vn.*405/.test(error.message))
})

test('Setup stops the running agent by its own process name before overwriting files', async () => {
  const { readFileSync: read } = await import('node:fs')
  const nsi = read('booth-agent/installer/installer.nsi', 'utf8')
  assert.match(nsi, /taskkill \/F \/T \/IM caspace-booth-agent\.exe/)
  assert.match(nsi, /`powershell [^`]*-like '\$INSTDIR\\\*'[^`]*`/, 'legacy node.exe stopped with a path that may contain spaces')
  assert.ok(nsi.indexOf('Call StopAgent') < nsi.indexOf('File /r'))
  assert.match(read('booth-agent/installer/launcher.vbs', 'utf8'), /caspace-booth-agent\.exe/)
  assert.match(read('booth-agent/installer/build.mjs', 'utf8'), /renameSync\(path\.join\(payload, 'node', 'node\.exe'\), path\.join\(payload, 'node', 'caspace-booth-agent\.exe'\)\)/)
})

test('30-second rescans skip uploaded exports before the queue and ignore old sessions', async () => {
  const { pendingJobs, PERIODIC_RESCAN_MS } = await import('../booth-agent/src/scanner.ts')
  assert.equal(PERIODIC_RESCAN_MS, 30_000)
  const state = tempState()
  state.mark(StateStore.key('/p/a.jpg', 10, 1), 'x')
  const jobs = [{ filePath: '/p/a.jpg', phone: '0912345678', sessionFolder: 's' }, { filePath: '/p/b.jpg', phone: '0912345678', sessionFolder: 's' }]
  const pending = await pendingJobs(jobs, state, async () => ({ size: 10, mtimeMs: 1 }))
  assert.deepEqual(pending.map((job) => job.filePath), ['/p/b.jpg'], 'already-sent file never re-queued')
  const edited = await pendingJobs(jobs, state, async () => ({ size: 11, mtimeMs: 2 }))
  assert.equal(edited.length, 2, 're-exported (changed) file is sent again; the server keeps both copies')
  const root = mkdtempSync(path.join(tmpdir(), 'pictures-'))
  for (const [folder, ageMs] of [['0912345678', 60_000], ['0947860616', 3 * AUTOMATIC_RESCAN_MS]] as const) {
    mkdirSync(path.join(root, folder, 'Output'), { recursive: true })
    writeFileSync(path.join(root, folder, 'Output', 'x.jpg'), jpeg)
    const time = (Date.now() - ageMs) / 1000
    utimesSync(path.join(root, folder, 'Output', 'x.jpg'), time, time)
    utimesSync(path.join(root, folder, 'Output'), time, time)
  }
  const recent = await scanExports(root, { sinceMs: Date.now() - AUTOMATIC_RESCAN_MS, notBeforeMs: 0 })
  assert.deepEqual(recent.jobs.map((job) => job.phone), ['0912345678'], 'old sessions skipped by Output folder mtime')
})

test('photos exported before 25/11/2026 (Vietnam time) are never sent, even by manual resend', async () => {
  assert.equal(new Date(UPLOAD_FROM_MS).toISOString(), '2026-11-24T17:00:00.000Z')
  const root = mkdtempSync(path.join(tmpdir(), 'pictures-'))
  const put = (relative: string, atMs: number) => {
    const file = path.join(root, relative)
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, jpeg)
    utimesSync(file, atMs / 1000, atMs / 1000)
    return file
  }
  const before = put('0947860616/Output/before.jpg', UPLOAD_FROM_MS - 60_000)
  const after = put('0947860616/Output/after.jpg', UPLOAD_FROM_MS + 60_000)
  const manual = await scanExports(root, { onlyFolder: '0947860616' })
  assert.deepEqual(manual.jobs.map((item) => path.basename(item.filePath)), ['after.jpg'])
  const startup = await scanExports(root, { sinceMs: 0 })
  assert.deepEqual(startup.jobs.map((item) => path.basename(item.filePath)), ['after.jpg'])
  assert.equal(await isOnOrAfterUploadFrom(before), false)
  assert.equal(await isOnOrAfterUploadFrom(after), true)
})

test('status page never auto-refreshes while staff type a folder name (meta refresh wiped the box)', () => {
  const html = renderStatusPage({ boothId: 'b', watchRoot: 'r', apiBaseUrl: 'a', pending: 0, uploaded: 0, lastError: null, unrecognized: [], failures: [] }, '', 'tok', 'n0nce')
  assert.ok(!/http-equiv="refresh"/.test(html), 'no meta refresh')
  assert.match(html, /<script nonce="n0nce">/)
  assert.match(html, /i\.value\|\|document\.activeElement===i/, 'skips refresh while typing or focused')
  assert.match(html, /location\.replace\('\/'\)/, 'reloads with GET, never re-posts the form')
})

test('resend finds a folder by phone number and reads Output even if the folder mtime is stale', async () => {
  const { planResend, describeResend } = await import('../booth-agent/src/scanner.ts')
  const root = mkdtempSync(path.join(tmpdir(), 'pictures-'))
  const now = Date.now()
  const put = (relative: string, atMs = now) => {
    const file = path.join(root, relative)
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, jpeg)
    utimesSync(file, atMs / 1000, atMs / 1000)
  }
  put('0912000111 Lan/Output/a.jpg')
  put('0912000111 Lan/Output/b.JPG')
  // Google Drive / network folders: the Output folder's own date can stay old.
  const old = (UPLOAD_FROM_MS - 86_400_000) / 1000
  utimesSync(path.join(root, '0912000111 Lan/Output'), old, old)
  const plan = await planResend(root, '0912000111')
  assert.deepEqual(plan.jobs.map((job) => path.basename(job.filePath)).sort(), ['a.jpg', 'b.JPG'])
  assert.ok(plan.jobs.every((job) => job.phone === '0912000111' && job.sessionFolder === '0912000111 Lan'))
  assert.match(describeResend('0912000111', plan, root), /Đang gửi lại 2 ảnh của 0912000111 Lan/)
  const manual = await scanExports(root, { onlyFolder: '0912000111 Lan' })
  assert.equal(manual.jobs.length, 2, 'exact-name resend no longer skipped by folder mtime')
})

test('resend explains why nothing was sent', async () => {
  const { planResend, describeResend } = await import('../booth-agent/src/scanner.ts')
  const root = mkdtempSync(path.join(tmpdir(), 'pictures-'))
  const put = (relative: string, atMs = Date.now()) => {
    const file = path.join(root, relative)
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, jpeg)
    utimesSync(file, atMs / 1000, atMs / 1000)
  }
  const say = async (input: string) => describeResend(input, await planResend(root, input), root)
  assert.match(await say('0911111111'), /Không thấy thư mục "0911111111"/)
  mkdirSync(path.join(root, '0922222222/Capture'), { recursive: true })
  assert.match(await say('0922222222'), /chưa có thư mục Output/)
  put('0933333333/Output/old.jpg', UPLOAD_FROM_MS - 60_000)
  assert.match(await say('0933333333'), /cả 1 ảnh JPG đều xuất trước 25\/11\/2026/)
  put('0944444444/Output/JPG/a.jpg')
  assert.match(await say('0944444444'), /thư mục con của Output/)
  put('0955555555/Output/a.tif')
  assert.match(await say('0955555555'), /không phải ảnh JPG/)
  put('tim/Output/a.jpg')
  assert.match(await say('tim'), /không có số điện thoại 10 số/)
})

test('1.1.3: up to 4 photos upload at the same time (was 2); config default and ceiling are 4', async () => {
  const { loadConfig, MAX_CONCURRENCY } = await import('../booth-agent/src/config.ts')
  assert.equal(MAX_CONCURRENCY, 4)
  const dir = mkdtempSync(path.join(tmpdir(), 'cfg-'))
  const file = path.join(dir, 'config.json')
  const base = { apiBaseUrl: 'https://caspace.vn', boothId: 'booth-3', boothKey: 'k'.repeat(8), watchRoot: dir }
  writeFileSync(file, JSON.stringify(base))
  assert.equal(loadConfig(file).concurrency, 4)
  writeFileSync(file, JSON.stringify({ ...base, concurrency: 9 }))
  assert.equal(loadConfig(file).concurrency, 4)
  let active = 0
  let peak = 0
  const queue = new UploadQueue({
    api: { baseUrl: 'http://api', key: 'k' }, state: tempState(), makeThumbnail: async () => jpeg, concurrency: 4,
    waitStable: async () => 1, statImpl: async () => ({ size: 1, mtimeMs: 1 }), readImpl: async () => jpeg,
    upload: async () => { active += 1; peak = Math.max(peak, active); await new Promise((resolve) => setTimeout(resolve, 5)); active -= 1; return { objectPath: 'x', alreadyUploaded: false, transfer: { bytes: 3_000_000, ms: 1_000 } } },
  })
  for (let index = 0; index < 10; index += 1) queue.enqueue({ filePath: `/p/0912345678/Output/${index}.jpg`, phone: '0912345678', sessionFolder: '0912345678' })
  await queue.idle()
  assert.equal(peak, 4)
})

test('1.1.3: the original PUT is timed and the status page shows the recent upload speed', async () => {
  const { TransferStats, describeTransfer } = await import('../booth-agent/src/speed.ts')
  const { calls, api } = fakeApi()
  const result = await uploadExport({ api, phone: '0947860616', filePath: '/p/0947860616/Output/a.jpg', bytes: jpeg, makeThumbnail: async () => jpeg })
  assert.equal(result.transfer?.bytes, jpeg.length)
  assert.ok((result.transfer?.ms ?? 0) >= 1)
  assert.ok(calls.length > 0)
  const again = fakeApi({ alreadyUploaded: true })
  assert.equal((await uploadExport({ api: again.api, phone: '0947860616', filePath: '/p/a.jpg', bytes: jpeg, makeThumbnail: async () => jpeg })).transfer, null, 'nothing sent → no timing')
  assert.equal(describeTransfer({ bytes: 3 * 1_048_576, ms: 2_000 }), '3.0 MB trong 2.0s (12.6 Mbps)')
  const stats = new TransferStats(2)
  assert.equal(stats.summary(), null)
  stats.add({ bytes: 1_000_000, ms: 1_000 }, 3_000)
  stats.add({ bytes: 3_000_000, ms: 3_000 }, 5_000)
  stats.add({ bytes: 2_000_000, ms: 1_000 }, 2_000)
  assert.deepEqual(stats.summary(), { photos: 2, avgSeconds: 2, avgPhotoSeconds: 3.5, mbps: 12 }, 'keeps only the last N')
  const html = renderStatusPage({ boothId: 'b', watchRoot: 'r', apiBaseUrl: 'a', pending: 0, uploaded: 2, lastError: null, unrecognized: [], failures: [], concurrency: 4, speed: stats.summary() })
  assert.match(html, /2 ảnh gần nhất: ảnh gốc mất trung bình <b>2,0 giây<\/b> \(12,0 Mbps mỗi ảnh\), cả ảnh 3,5 giây · gửi 4 ảnh cùng lúc/)
  assert.match(renderStatusPage({ boothId: 'b', watchRoot: 'r', apiBaseUrl: 'a', pending: 0, uploaded: 0, lastError: null, unrecognized: [], failures: [] }), /Chưa gửi ảnh nào/)
})
