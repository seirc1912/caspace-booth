#!/usr/bin/env node
// Read-only upload performance report (docs/KE-HOACH-TOI-UU-UPLOAD-ANH.md §4).
//
// Pulls Vercel runtime logs (retained ~30 days) through the logged-in Vercel
// CLI, caches them per day as JSONL (allow-listed numeric fields only), and
// analyses real customer traffic to find *when* uploads degrade:
//   - §4.4 baseline table (p50/p95)
//   - 5-minute windows flagged as abnormal (failures, slow storage, slow transfer)
//   - load buckets: does slowness grow with concurrent uploads (overload) or not (network/random)?
//   - hour-of-day / weekday profile (Asia/Ho_Chi_Minh)
// Never writes anything to Vercel or Supabase.
//
//   node scripts/upload-timing-report.mjs --since 30d
//   node scripts/upload-timing-report.mjs --since 2026-11-21T03:00:00Z --until 2026-11-21T04:00:00Z --measure wifi
//   node scripts/upload-timing-report.mjs --since 30d --json > report.json
//
// Options: --scope (caspace1) --project (caspace prj id) --since/--until (ISO or 2h/7d; default 24h)
//          --measure <label|all|none> (client events filter; default all)
//          --cache <dir> (default .upload-logs; days older than today are reused) --no-cache
//          --top <n> abnormal windows to list (default 20)

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const argv = process.argv.slice(2)
const args = {}
for (let index = 0; index < argv.length; index += 1) {
  if (!argv[index].startsWith('--')) continue
  const next = argv[index + 1]
  args[argv[index].slice(2)] = next === undefined || next.startsWith('--') ? 'true' : (index += 1, next)
}
const scope = args.scope ?? 'caspace1'
const project = args.project ?? 'prj_GdrTrN1EUY3CXUCHHyxyCPB9QQK8'
const measureFilter = args.measure ?? 'all'
const cacheDir = args['no-cache'] ? null : (args.cache ?? '.upload-logs')
const topN = Number(args.top ?? 20)
const DAY = 86_400_000
const WINDOW = 5 * 60_000
const VN_OFFSET = 7 * 3_600_000

function toDate(value, fallback) {
  if (!value) return fallback
  const relative = /^(\d+)([mhd])$/.exec(value)
  if (relative) return new Date(Date.now() - Number(relative[1]) * { m: 60_000, h: 3_600_000, d: DAY }[relative[2]])
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid time: ${value}`)
  return date
}
const until = toDate(args.until, new Date())
const since = toDate(args.since, new Date(until.getTime() - DAY))

const SOURCES = {
  server: 'photo-upload\\:timing',
  failure: 'photo-upload\\:failure',
  clientFile: 'photo-upload\\:client-timing',
  clientBatch: 'photo-upload\\:client-batch',
  frameSave: 'editor\\:save-timing',
}

// Node util.inspect output of the allow-listed log object → flat scalar fields.
function fields(message) {
  const body = message.slice(message.indexOf('{'))
  return Object.fromEntries([...body.matchAll(/(\w+): (?:'([^']*)'|([^,\n}]+))/g)].map(([, key, quoted, raw]) => {
    if (quoted !== undefined) return [key, quoted]
    const value = raw.trim()
    if (value === 'true' || value === 'false') return [key, value === 'true']
    if (value === 'null') return [key, null]
    return [key, Number.isNaN(Number(value)) ? value : Number(value)]
  }))
}

// The CLI caps one response at 100 records, so windows are split until they fit.
function fetchWindow(query, start, end, out, depth = 0) {
  const result = spawnSync('vercel', ['logs', '--scope', scope, '--project', project, '--since', start.toISOString(), '--until', end.toISOString(), '--query', query, '--json'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  const lines = result.stdout.split('\n').filter(Boolean).flatMap((line) => { try { return [JSON.parse(line)] } catch { return [] } })
  const logs = lines.filter((line) => line.type === 'log').map((line) => line.data)
  const hasMore = lines.find((line) => line.type === 'summary')?.pagination?.hasMore
  if ((hasMore || (result.status && !logs.length)) && end - start > 2 * 60_000 && depth < 12) {
    const middle = new Date(start.getTime() + (end - start) / 2)
    fetchWindow(query, start, middle, out, depth + 1); fetchWindow(query, middle, end, out, depth + 1)
    return
  }
  if (result.status && !logs.length) process.stderr.write(`warning: ${query} ${start.toISOString()} failed: ${result.stderr.trim().slice(-160)}\n`)
  if (hasMore) process.stderr.write(`warning: ${query} ${start.toISOString()} still truncated\n`)
  for (const log of logs) out.set(`${log.requestId}|${log.timestamp}|${log.message.slice(0, 80)}`, { t: log.timestamp, region: log.region, ...fields(log.message) })
}

function load(name) {
  const query = SOURCES[name]
  const rows = []
  const firstDay = Date.UTC(since.getUTCFullYear(), since.getUTCMonth(), since.getUTCDate())
  for (let dayStart = firstDay; dayStart < until.getTime(); dayStart += DAY) {
    const dayEnd = dayStart + DAY
    const complete = dayEnd < Date.now() - 10 * 60_000
    const file = cacheDir ? join(cacheDir, name, `${new Date(dayStart).toISOString().slice(0, 10)}.jsonl`) : null
    let dayRows
    if (file && complete && existsSync(file)) {
      dayRows = readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line))
    } else {
      const out = new Map()
      for (let start = dayStart; start < Math.min(dayEnd, Date.now()); start += 6 * 3_600_000) fetchWindow(query, new Date(start), new Date(Math.min(dayEnd, start + 6 * 3_600_000)), out)
      dayRows = [...out.values()].sort((a, b) => a.t.localeCompare(b.t))
      if (file && complete) { mkdirSync(join(cacheDir, name), { recursive: true }); writeFileSync(file, dayRows.map((row) => JSON.stringify(row)).join('\n') + '\n') }
    }
    process.stderr.write(`. ${name} ${new Date(dayStart).toISOString().slice(0, 10)}: ${dayRows.length}\n`)
    rows.push(...dayRows.filter((row) => row.t >= since.toISOString() && row.t < until.toISOString()))
  }
  return rows
}

const keepMeasure = (row) => measureFilter === 'all' || (measureFilter === 'none' ? row.measure == null : row.measure === measureFilter)
const server = load('server')
const failures = load('failure')
const clientFiles = load('clientFile').filter(keepMeasure)
const clientBatches = load('clientBatch').filter(keepMeasure)
const frameSaves = load('frameSave').filter(keepMeasure)

const percentile = (values, q) => values.length ? [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * q))] : null
const stat = (values) => { const clean = values.filter((value) => Number.isFinite(value)); return { n: clean.length, p50: percentile(clean, 0.5), p95: percentile(clean, 0.95), max: clean.length ? Math.max(...clean) : null } }
const count = (items, key) => items.reduce((map, item) => ({ ...map, [item[key]]: (map[item[key]] ?? 0) + 1 }), {})
const okStage = (stage) => server.filter((row) => row.stage === stage && row.outcome === 'ok')
const kbps = (row) => row.bytes && row.transferMs > 0 ? (row.bytes * 8 / 1000) / (row.transferMs / 1000) : null
const vnTime = (iso) => new Date(new Date(iso).getTime() + VN_OFFSET).toISOString().slice(0, 16).replace('T', ' ')

const inits = okStage('init')
const verifications = okStage('verification')
const finalFailures = failures.filter((row) => row.stage !== 'tus-create') // TUS-create errors fall back to standard upload
const global = {
  verificationP95: stat(verifications.map((row) => row.durationMs)).p95,
  storageP95: stat(verifications.map((row) => row.storageResponseMs)).p95,
  kbpsP50: stat(clientFiles.map(kbps)).p50,
}

// ---- 5-minute windows ------------------------------------------------------
const windows = new Map()
const bucket = (iso) => {
  const key = Math.floor(new Date(iso).getTime() / WINDOW) * WINDOW
  if (!windows.has(key)) windows.set(key, { key, inits: 0, verified: [], failures: [], tusCreate: 0, files: [], batches: [] })
  return windows.get(key)
}
for (const row of inits) bucket(row.t).inits += 1
for (const row of verifications) bucket(row.t).verified.push(row)
for (const row of failures) row.stage === 'tus-create' ? bucket(row.t).tusCreate += 1 : bucket(row.t).failures.push(row)
for (const row of clientFiles) bucket(row.t).files.push(row)
for (const row of clientBatches) bucket(row.t).batches.push(row)

const windowRows = [...windows.values()].map((w) => {
  const verification = stat(w.verified.map((row) => row.durationMs))
  const storage = stat(w.verified.map((row) => row.storageResponseMs))
  const throughput = stat(w.files.map(kbps))
  const failRate = w.failures.length / Math.max(1, w.verified.length + w.failures.length)
  const reasons = []
  if (w.failures.length >= 2 || (failRate >= 0.2 && w.failures.length > 0)) reasons.push(`lỗi ${w.failures.length} (${Math.round(failRate * 100)}%)`)
  if (storage.n >= 2 && global.storageP95 && storage.p95 > 2 * global.storageP95) reasons.push(`Supabase chậm p95 ${storage.p95}ms`)
  if (verification.n >= 2 && global.verificationP95 && verification.p95 > 2 * global.verificationP95) reasons.push(`kiểm tra chậm p95 ${verification.p95}ms`)
  if (throughput.n >= 2 && global.kbpsP50 && throughput.p50 < 0.5 * global.kbpsP50) reasons.push(`truyền chậm ${Math.round(throughput.p50)} kbps`)
  const badBatches = w.batches.filter((row) => row.outcome !== 'ok').length
  if (badBatches) reasons.push(`${badBatches} lượt khách lỗi/bỏ dở`)
  const timeouts = w.failures.filter((row) => row.code === 'STORAGE_STANDARD_TIMEOUT').length
  return { start: new Date(w.key).toISOString(), vn: vnTime(new Date(w.key).toISOString()), load: w.inits, verified: w.verified.length, failures: w.failures.length, timeouts, tusCreate400: w.tusCreate, verificationP95: verification.p95, storageP95: storage.p95, transferKbpsP50: throughput.p50 && Math.round(throughput.p50), batches: w.batches.length, badBatches, reasons, score: reasons.length * 10 + w.failures.length + badBatches * 2 }
}).sort((a, b) => a.start.localeCompare(b.start))
const abnormal = windowRows.filter((row) => row.reasons.length).sort((a, b) => b.score - a.score)

// ---- Load buckets: is slowness correlated with concurrent uploads? ---------
const loadBands = [[1, 5], [6, 15], [16, 30], [31, Infinity]]
const byLoad = loadBands.map(([low, high]) => {
  const rows = windowRows.filter((row) => row.load >= low && row.load <= high)
  const verifiedRows = verifications.filter((row) => { const w = windows.get(Math.floor(new Date(row.t).getTime() / WINDOW) * WINDOW); return w && w.inits >= low && w.inits <= high })
  const failureCount = rows.reduce((sum, row) => sum + row.failures, 0)
  const verifiedCount = rows.reduce((sum, row) => sum + row.verified, 0)
  return { band: high === Infinity ? `${low}+` : `${low}-${high}`, windows: rows.length, files: verifiedCount, storageP95: stat(verifiedRows.map((row) => row.storageResponseMs)).p95, verificationP95: stat(verifiedRows.map((row) => row.durationMs)).p95, failRatePct: Math.round(1000 * failureCount / Math.max(1, failureCount + verifiedCount)) / 10, abnormalWindows: rows.filter((row) => row.reasons.length).length }
})

// ---- Hour-of-day / weekday profile (VN time) -------------------------------
const weekdays = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']
const profile = (keyOf) => {
  const groups = {}
  for (const row of windowRows) { const key = keyOf(new Date(new Date(row.start).getTime() + VN_OFFSET)); (groups[key] ??= []).push(row) }
  return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true })).map(([key, rows]) => ({ key, files: rows.reduce((sum, row) => sum + row.verified, 0), failures: rows.reduce((sum, row) => sum + row.failures, 0), activeWindows: rows.length, abnormalWindows: rows.filter((row) => row.reasons.length).length, peakLoad5m: Math.max(...rows.map((row) => row.load)) }))
}
const byHour = profile((date) => String(date.getUTCHours()).padStart(2, '0'))
const byWeekday = profile((date) => `${date.getUTCDay()} ${weekdays[date.getUTCDay()]}`)

const report = {
  window: { since: since.toISOString(), until: until.toISOString(), measure: measureFilter },
  baseline: {
    init: stat(inits.map((row) => row.durationMs)), verification: stat(verifications.map((row) => row.durationMs)),
    storageResponseMs: stat(verifications.map((row) => row.storageResponseMs)), streamVerificationMs: stat(verifications.map((row) => row.streamVerificationMs)),
    sizeBand: count(inits, 'sizeBand'), failures: { total: failures.length, final: finalFailures.length, byCode: count(failures, 'code') },
    clientFile: { n: clientFiles.length, hashMs: stat(clientFiles.map((row) => row.hashMs)), transferMs: stat(clientFiles.map((row) => row.transferMs)), totalMs: stat(clientFiles.map((row) => row.totalMs)), kbps: stat(clientFiles.map(kbps)), tusFallback: clientFiles.filter((row) => row.tusFallback).length, byDevice: count(clientFiles, 'device'), byNetwork: count(clientFiles, 'network') },
    clientBatch: { n: clientBatches.length, totalMs: stat(clientBatches.map((row) => row.totalMs)), byOutcome: count(clientBatches, 'outcome'), retries: clientBatches.filter((row) => row.attempt > 1).length, byMeasure: count(clientBatches, 'measure') },
    frameSave: { n: frameSaves.length, renderMs: stat(frameSaves.map((row) => row.renderMs)), bytes: stat(frameSaves.map((row) => row.bytes)) },
  },
  byLoad, byHour, byWeekday, abnormal: abnormal.slice(0, topN), activeWindows: windowRows.length, abnormalWindows: abnormal.length,
}

if (args.json) { console.log(JSON.stringify(report, null, 2)); process.exit(0) }

const b = report.baseline
const pair = (s, unit = '') => s?.n ? `${s.p50}${unit} / ${s.p95}${unit}` : '—'
const secs = (s) => s?.n ? `${(s.p50 / 1000).toFixed(1)} / ${(s.p95 / 1000).toFixed(1)}` : '—'
const table = (headers, rows) => [`| ${headers.join(' | ')} |`, `|${headers.map(() => '---').join('|')}|`, ...rows.map((row) => `| ${row.join(' | ')} |`)].join('\n')

console.log(`# Báo cáo gửi ảnh — ${vnTime(report.window.since)} → ${vnTime(report.window.until)} (giờ VN) · client filter: ${measureFilter}\n`)
console.log('## 1. Bảng §4.4\n')
console.log(table(['Chỉ số', 'Giá trị'], [
  ['Dung lượng TB file khung (MB) — editor', b.frameSave.n ? `${(frameSaves.reduce((sum, row) => sum + row.bytes, 0) / b.frameSave.n / 1048576).toFixed(2)} (n=${b.frameSave.n})` : '—'],
  ['Thời gian lưu 1 khung p50 / p95 (s)', secs(b.frameSave.renderMs)],
  ['Gửi 1 lượt p50 / p95 (s)', `${secs(b.clientBatch.totalMs)} (n=${b.clientBatch.n}, ${JSON.stringify(b.clientBatch.byOutcome)}, bấm lại ${b.clientBatch.retries})`],
  ['`init` p50 / p95 (ms)', `${pair(b.init)} (n=${b.init.n})`],
  ['`verification` p50 / p95 (ms)', `${pair(b.verification)} (n=${b.verification.n}); Supabase ${pair(b.storageResponseMs)}`],
  ['Lỗi `[photo-upload:failure]`', `${b.failures.total} (thất bại thật ${b.failures.final}) ${JSON.stringify(b.failures.byCode)}`],
  ['Tốc độ truyền phía khách p50 / p95 (kbps)', b.clientFile.n ? `${Math.round(b.clientFile.kbps.p50)} / ${Math.round(b.clientFile.kbps.p95)} (n=${b.clientFile.n}, TUS→thường ${b.clientFile.tusFallback})` : '—'],
]))
console.log('\n## 2. Tải cao có làm chậm/lỗi không? (theo số file bắt đầu gửi trong 5 phút)\n')
console.log(table(['Tải / 5 phút', 'Số khung 5p', 'File OK', 'Supabase p95 (ms)', 'Kiểm tra p95 (ms)', 'Tỉ lệ lỗi', 'Khung bất thường'], byLoad.map((row) => [row.band, row.windows, row.files, row.storageP95 ?? '—', row.verificationP95 ?? '—', `${row.failRatePct}%`, row.abnormalWindows])))
console.log('\n→ Nếu p95/tỉ lệ lỗi tăng rõ theo tải: quá tải phía server/Supabase. Nếu phẳng: do mạng từng khách / sự cố ngẫu nhiên.')
console.log(`\n## 3. Khung 5 phút bất thường (${abnormal.length}/${windowRows.length} khung có hoạt động; top ${Math.min(topN, abnormal.length)})\n`)
console.log(table(['Giờ VN', 'Tải', 'OK', 'Lỗi', 'Timeout', 'TUS400', 'Supabase p95', 'Kbps p50', 'Lý do'], report.abnormal.map((row) => [row.vn, row.load, row.verified, row.failures, row.timeouts, row.tusCreate400, row.storageP95 ?? '—', row.transferKbpsP50 ?? '—', row.reasons.join('; ')])))
console.log('\n## 4. Theo giờ trong ngày (VN)\n')
console.log(table(['Giờ', 'File OK', 'Lỗi', 'Khung hoạt động', 'Khung bất thường', 'Tải đỉnh/5p'], byHour.map((row) => [`${row.key}h`, row.files, row.failures, row.activeWindows, row.abnormalWindows, row.peakLoad5m])))
console.log('\n## 5. Theo thứ\n')
console.log(table(['Thứ', 'File OK', 'Lỗi', 'Khung hoạt động', 'Khung bất thường', 'Tải đỉnh/5p'], byWeekday.map((row) => [row.key.slice(2), row.files, row.failures, row.activeWindows, row.abnormalWindows, row.peakLoad5m])))
console.log('\nGhi chú: "Mở thư mục staff" và Image Transformations không có trong log Vercel (§4.3). Log Vercel giữ ~30 ngày; cache cục bộ giữ lâu hơn.')
