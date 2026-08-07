import { createHash, randomUUID } from 'node:crypto'
import { existsSync, watch } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { basename, extname, resolve } from 'node:path'

interface Config { boothId: string; watchFolder: string; supabaseUrl: string }
interface QueueItem { path: string; attempts: number }
interface ActiveSession { session_id: string }

const configPath = resolve(process.argv[2] ?? 'config.json')
const config = JSON.parse(await readFile(configPath, 'utf8')) as Config
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? ''
if (!config.boothId || !config.watchFolder || !config.supabaseUrl) throw new Error('config.json requires boothId, watchFolder, and supabaseUrl')
if (!serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required')
if (!existsSync(config.watchFolder)) throw new Error(`Watch folder does not exist: ${config.watchFolder}`)

const projectUrl = config.supabaseUrl.replace(/\/$/, '')
const headers = (extra: Record<string, string> = {}) => ({ apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, ...extra })
const queued = new Set<string>()
const uploaded = new Set<string>()
const queue: QueueItem[] = []
let processing = false

const delay = (milliseconds: number) => new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds))
const isJpeg = (path: string) => ['.jpg', '.jpeg'].includes(extname(path).toLowerCase())
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
  await waitUntilStable(item.path)
  const bytes = await readFile(item.path)
  const hash = createHash('sha256').update(bytes).digest('hex')
  if (uploaded.has(hash)) return

  const sessionResponse = await checked(await fetch(`${projectUrl}/rest/v1/customer_sessions?booth_id=eq.${encodeURIComponent(config.boothId)}&status=eq.active&select=session_id&order=created_at.desc&limit=1`, { headers: headers() }))
  const session = ((await sessionResponse.json()) as ActiveSession[])[0]
  if (!session) { console.log(`[ignored] ${basename(item.path)}: no active session`); uploaded.add(hash); return }

  const duplicateResponse = await checked(await fetch(`${projectUrl}/rest/v1/session_photos?session_id=eq.${session.session_id}&content_hash=eq.${hash}&select=id&limit=1`, { headers: headers() }))
  if (((await duplicateResponse.json()) as unknown[]).length) { uploaded.add(hash); return }

  const safeName = basename(item.path).replace(/[^a-zA-Z0-9._-]/g, '_')
  const storagePath = `${config.boothId}/${session.session_id}/${randomUUID()}-${safeName}`
  const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  await checked(await fetch(`${projectUrl}/storage/v1/object/session-photos/${storagePath}`, { method: 'POST', headers: headers({ 'Content-Type': 'image/jpeg', 'x-upsert': 'false' }), body }))
  try {
    await checked(await fetch(`${projectUrl}/rest/v1/session_photos`, {
      method: 'POST', headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ session_id: session.session_id, booth_id: config.boothId, storage_path: storagePath, source_name: basename(item.path), content_hash: hash }),
    }))
  } catch (error) {
    await fetch(`${projectUrl}/storage/v1/object/session-photos/${storagePath}`, { method: 'DELETE', headers: headers() })
    throw error
  }
  uploaded.add(hash)
  console.log(`[uploaded] ${basename(item.path)} -> ${session.session_id}`)
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
