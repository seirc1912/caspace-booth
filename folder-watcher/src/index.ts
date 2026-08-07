import { createHash, randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { loadEnvFile } from 'node:process'
import chokidar from 'chokidar'

interface Config { boothId: string; watchFolder: string; supabaseUrl: string; serviceRoleKey?: string }
interface QueueItem { path: string; attempts: number }

const configPath = resolve(process.argv[2] ?? 'config.json')
const environmentServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? ''
const config = JSON.parse(await readFile(configPath, 'utf8')) as Config
const envPath = join(dirname(configPath), '.env')
if (existsSync(envPath)) loadEnvFile(envPath)
const dotEnvServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? ''
const serviceKey = environmentServiceKey || config.serviceRoleKey?.trim() || dotEnvServiceKey
if (!config.boothId || !config.watchFolder || !config.supabaseUrl) throw new Error('config.json requires boothId, watchFolder, and supabaseUrl')
if (!serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required in the environment, config.json, or .env')
if (!existsSync(config.watchFolder)) throw new Error(`Watch folder does not exist: ${config.watchFolder}`)

const projectUrl = config.supabaseUrl.replace(/\/$/, '')
const headers = (extra: Record<string, string> = {}) => ({ apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, ...extra })
const queued = new Set<string>()
const uploaded = new Set<string>()
const queue: QueueItem[] = []
let processing = false

const delay = (milliseconds: number) => new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds))
const isSupportedImage = (path: string) => ['.jpg', '.jpeg', '.png'].includes(extname(path).toLowerCase())
async function checked(response: Response) { if (!response.ok) throw new Error(`Supabase ${response.status}: ${await response.text()}`); return response }

async function waitUntilStable(path: string) {
  let previous = -1
  let stableChecks = 0
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const info = await stat(path)
      stableChecks = info.size > 0 && info.size === previous ? stableChecks + 1 : 0
      if (stableChecks >= 3) return
      previous = info.size
    } catch { stableChecks = 0 }
    await delay(500)
  }
  throw new Error(`File did not become stable: ${path}`)
}

async function upload(item: QueueItem) {
  console.log(`[upload] started: ${item.path}`)
  await waitUntilStable(item.path)
  const bytes = await readFile(item.path)
  const hash = createHash('sha256').update(bytes).digest('hex')
  if (uploaded.has(hash)) return

  const safeName = basename(item.path).replace(/[^a-zA-Z0-9._-]/g, '_')
  const storagePath = `${config.boothId}/${randomUUID()}-${safeName}`
  const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  await checked(await fetch(`${projectUrl}/storage/v1/object/session-photos/${storagePath}`, { method: 'POST', headers: headers({ 'Content-Type': 'image/jpeg', 'x-upsert': 'false' }), body }))
  uploaded.add(hash)
  console.log(`[uploaded] ${basename(item.path)} -> ${storagePath}`)
  console.log(`[upload] completed: ${item.path}`)
}

async function drain() {
  if (processing) return
  processing = true
  while (queue.length) {
    const item = queue.shift()!
    try { await upload(item); queued.delete(item.path) }
    catch (error) {
      item.attempts += 1
      console.error(`[upload] failed: ${item.path}`, error)
      console.error(`[retry ${item.attempts}] ${item.path}`, error)
      if (item.attempts < 8) { await delay(Math.min(30_000, 1000 * 2 ** item.attempts)); queue.push(item) }
      else queued.delete(item.path)
    }
  }
  processing = false
}

function enqueue(path: string) {
  if (!isSupportedImage(path)) {
    console.log(`[watcher] file rejected (unsupported extension): ${path}`)
    return
  }
  if (queued.has(path)) {
    console.log(`[watcher] file rejected (already queued): ${path}`)
    return
  }
  console.log(`[watcher] file accepted: ${path}`)
  queued.add(path)
  queue.push({ path, attempts: 0 })
  console.log(`[queue] queued: ${path}`)
  void drain()
}

console.log(`[watcher] initializing: ${config.watchFolder}`)
const watcher = chokidar.watch(config.watchFolder, { ignoreInitial: true })
watcher.on('ready', () => {
  console.log(`[watcher] initialized: ${config.watchFolder}`)
  console.log(`FolderWatcher ready: ${config.boothId} -> ${config.watchFolder}`)
})
watcher.on('all', (event, path) => {
  console.log(`[watcher] fs event received: ${event}`)
  console.log(`[watcher] filename received: ${basename(path)}`)
  const fullPath = resolve(path)
  console.log(`[watcher] resolved full path: ${fullPath}`)
  if (event !== 'add' && event !== 'change') {
    console.log(`[watcher] file rejected (event ${event}): ${fullPath}`)
    return
  }
  enqueue(fullPath)
})
watcher.on('error', (error) => console.error('[watcher] error:', error))
