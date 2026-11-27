import chokidar from 'chokidar'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { loadConfig } from './config.ts'
import { notifyOnce } from './notify.ts'
import { classifyExport } from './phoneFolder.ts'
import { UploadQueue } from './queue.ts'
import { AUTOMATIC_RESCAN_MS, describeResend, isOnOrAfterUploadFrom, PERIODIC_RESCAN_MS, pendingJobs, planResend, scanExports } from './scanner.ts'
import { describeTransfer, TransferStats } from './speed.ts'
import { StateStore } from './stateStore.ts'
import { startStatusServer } from './statusServer.ts'
import { makePreview, makeThumbnail } from './thumbnail.ts'

const configPath = path.resolve(process.argv[2] ?? 'config.json')
const config = loadConfig(configPath)
if (!existsSync(config.watchRoot)) throw new Error(`Không thấy thư mục theo dõi: ${config.watchRoot}`)

const state = new StateStore(path.join(path.dirname(configPath), 'state', 'uploaded.json'))
const unrecognized = new Set<string>()
let lastError: string | null = null
const speed = new TransferStats()
const log = (message: string) => console.log(`${new Date().toISOString()} ${message}`)

const queue = new UploadQueue({
  api: { baseUrl: config.apiBaseUrl, key: config.boothKey },
  state,
  makeThumbnail,
  makePreview,
  concurrency: config.concurrency,
  onEvent: (event) => {
    if (event.type === 'uploaded') {
      lastError = null
      if (event.transfer) speed.add(event.transfer, event.durationMs)
      const detail = event.transfer ? ` — ảnh gốc ${describeTransfer(event.transfer)}, cả ảnh ${(event.durationMs / 1000).toFixed(1)}s` : ''
      log(`[sent] ${event.job.sessionFolder}/${path.basename(event.job.filePath)}${event.alreadyUploaded ? ' (đã có)' : ''}${detail}`)
    }
    if (event.type === 'retry') { lastError = event.reason; log(`[retry ${event.attempt}] ${path.basename(event.job.filePath)}: ${event.reason} — thử lại sau ${Math.round(event.delayMs / 1000)}s`) }
    if (event.type === 'failed') {
      log(`[failed] ${path.basename(event.job.filePath)}: ${event.reason}`)
      notifyOnce(`failed:${event.job.filePath}`, 'Không gửi được ảnh', `${event.job.sessionFolder}: ${event.reason}`)
    }
  },
})

function reportUnrecognized(folder: string) {
  if (unrecognized.has(folder)) return
  unrecognized.add(folder)
  log(`[skip] thư mục không có số điện thoại: ${folder}`)
  notifyOnce(`folder:${folder}`, 'Thư mục sai tên', `"${folder}" không có số điện thoại 10 số nên ảnh chưa được gửi. Hãy đổi tên thư mục.`)
}

async function handle(filePath: string) {
  const classified = classifyExport(filePath, config.watchRoot)
  if (!classified) return
  if (!(await isOnOrAfterUploadFrom(filePath))) return
  if (classified.kind === 'unrecognized') { reportUnrecognized(classified.sessionFolder); return }
  unrecognized.delete(classified.sessionFolder)
  queue.enqueue({ filePath, phone: classified.phone, sessionFolder: classified.sessionFolder })
}

async function resend(input: string) {
  if (!input || input.includes('/') || input.includes('\\') || input.startsWith('.')) return 'Tên thư mục không hợp lệ.'
  const plan = await planResend(config.watchRoot, input)
  for (const folder of new Set(plan.jobs.map((job) => job.sessionFolder))) state.forgetFolder(path.join(config.watchRoot, folder) + path.sep)
  plan.jobs.forEach((job) => queue.enqueue(job))
  const message = describeResend(input, plan, config.watchRoot)
  log(`[resend] ${message}`)
  return message
}

async function rescanRecent() {
  const result = await scanExports(config.watchRoot, { sinceMs: Date.now() - AUTOMATIC_RESCAN_MS })
  result.unrecognized.forEach(reportUnrecognized)
  const pending = await pendingJobs(result.jobs, state)
  pending.forEach((job) => queue.enqueue(job))
  return pending.length
}

const initialPending = await rescanRecent()
log(`[start] ${config.boothId} → ${config.apiBaseUrl}; theo dõi ${config.watchRoot}; ${initialPending} ảnh trong 6 giờ chưa gửi`)
setInterval(() => {
  void rescanRecent().then((count) => { if (count) log(`[rescan] tìm thấy ${count} ảnh chưa gửi`) }).catch((error) => log(`[rescan-error] ${error instanceof Error ? error.message : String(error)}`))
}, PERIODIC_RESCAN_MS)

chokidar.watch(config.watchRoot, { ignoreInitial: true, depth: 2, ignored: (file) => path.basename(file).startsWith('.') })
  .on('add', (file) => { void handle(file) })
  .on('change', (file) => { void handle(file) })
  .on('addDir', (dir) => {
    // A renamed folder ("tim" → "0947860616 tim") shows up as a new directory: rescan it.
    const relative = path.relative(config.watchRoot, dir).split(/[\\/]/)
    if (relative.length === 1 && relative[0]) void scanExports(config.watchRoot, { onlyFolder: relative[0] }).then((result) => result.jobs.forEach((job) => queue.enqueue(job)))
  })
  .on('unlinkDir', (dir) => { unrecognized.delete(path.relative(config.watchRoot, dir)) })
  .on('error', (error) => log(`[watch-error] ${error instanceof Error ? error.message : String(error)}`))

startStatusServer(config.statusPort, () => ({
  boothId: config.boothId,
  watchRoot: config.watchRoot,
  apiBaseUrl: config.apiBaseUrl,
  pending: queue.pendingCount,
  uploaded: queue.uploadedCount,
  lastError,
  concurrency: config.concurrency,
  speed: speed.summary(),
  unrecognized: [...unrecognized],
  failures: [...queue.failures].map(([file, reason]) => ({ file: path.relative(config.watchRoot, file), reason })),
}), resend)
log(`[status] http://127.0.0.1:${config.statusPort}`)
