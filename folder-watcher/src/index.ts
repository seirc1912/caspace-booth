import { createHash } from 'node:crypto'
import { existsSync, watch } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { basename, extname, resolve } from 'node:path'

interface Config { boothId: string; watchFolder: string; serverUrl: string; importKey?: string }
interface QueueItem { path: string; attempts: number }

const configPath = resolve(process.argv[2] ?? 'config.json')
const config = JSON.parse(await readFile(configPath, 'utf8')) as Config
if (!config.boothId || !config.watchFolder || !config.serverUrl) throw new Error('config.json requires boothId, watchFolder, and serverUrl')
if (!existsSync(config.watchFolder)) throw new Error(`Watch folder does not exist: ${config.watchFolder}`)

const queued = new Set<string>()
const uploaded = new Set<string>()
const queue: QueueItem[] = []
let processing = false

const delay = (milliseconds: number) => new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds))
const isJpeg = (path: string) => ['.jpg', '.jpeg'].includes(extname(path).toLowerCase())

async function waitUntilStable(path: string) {
  let previous = -1
  let stableChecks = 0
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const info = await stat(path)
      if (info.size > 0 && info.size === previous) stableChecks += 1
      else stableChecks = 0
      if (stableChecks >= 3) return
      previous = info.size
    } catch { stableChecks = 0 }
    await delay(500)
  }
  throw new Error(`File did not become stable: ${path}`)
}

async function upload(item: QueueItem) {
  await waitUntilStable(item.path)
  const bytes = await readFile(item.path)
  const hash = createHash('sha256').update(bytes).digest('hex')
  if (uploaded.has(hash)) return
  const form = new FormData()
  form.append('boothId', config.boothId)
  form.append('photo', new Blob([bytes], { type: 'image/jpeg' }), basename(item.path))
  const response = await fetch(`${config.serverUrl.replace(/\/$/, '')}/api/photos/import`, {
    method: 'POST', body: form,
    headers: { 'X-Content-SHA256': hash, ...(config.importKey ? { 'X-Booth-Import-Key': config.importKey } : {}) },
  })
  const body = await response.text()
  if (!response.ok) throw new Error(`Upload failed (${response.status}): ${body}`)
  uploaded.add(hash)
  console.log(`[uploaded] ${basename(item.path)} ${body}`)
}

async function drain() {
  if (processing) return
  processing = true
  while (queue.length) {
    const item = queue.shift()!
    try { await upload(item); queued.delete(item.path) }
    catch (error) {
      item.attempts += 1
      console.error(`[retry ${item.attempts}] ${item.path}`, error)
      if (item.attempts < 8) { await delay(Math.min(30_000, 1000 * 2 ** item.attempts)); queue.push(item) }
      else queued.delete(item.path)
    }
  }
  processing = false
}

function enqueue(path: string) {
  if (!isJpeg(path) || queued.has(path)) return
  queued.add(path); queue.push({ path, attempts: 0 }); void drain()
}

watch(config.watchFolder, (_event, filename) => { if (filename) enqueue(resolve(config.watchFolder, filename)) })
console.log(`FolderWatcher ready: ${config.boothId} -> ${config.watchFolder}`)
