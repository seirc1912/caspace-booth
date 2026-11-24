import { readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { classifyExport } from './phoneFolder.ts'
import { StateStore } from './stateStore.ts'
import type { QueueJob } from './queue.ts'

// Matches the 6-hour Supabase retention: older photos are already deleted online, so a
// reinstall must not send them again (staff use "Gửi lại thư mục" when a customer needs one).
export const AUTOMATIC_RESCAN_MS = 6 * 60 * 60_000
/**
 * Owner decision (25/11/2026): only photos exported from 25/11/2026 00:00 Vietnam time (UTC+7)
 * are ever sent — startup, live events, renamed folders and manual resend alike. Older photos
 * stay on the PC / Google Drive and are never uploaded.
 */
export const UPLOAD_FROM_MS = Date.UTC(2026, 10, 24, 17, 0, 0)
/** Safety net for missed file events (network/shared folders, sleep): look again every 30 s. */
export const PERIODIC_RESCAN_MS = 30_000

export interface ScanResult { jobs: QueueJob[]; unrecognized: string[] }

async function outputFiles(root: string, sessionFolder: string, sinceMs?: number) {
  const output = await readdir(path.join(root, sessionFolder), { withFileTypes: true })
  const folder = output.find((entry) => entry.isDirectory() && entry.name.toLowerCase() === 'output')
  if (!folder) return []
  const dir = path.join(root, sessionFolder, folder.name)
  // Adding a file updates the Output folder's mtime: old sessions are skipped without
  // touching their files, so a 30-second rescan stays cheap with hundreds of sessions.
  if (sinceMs !== undefined && (await stat(dir)).mtimeMs < sinceMs) return []
  return (await readdir(dir, { withFileTypes: true })).filter((entry) => entry.isFile()).map((entry) => path.join(dir, entry.name))
}

/**
 * Startup scan: Output JPEGs modified since `sinceMs` (6 h by default, so reinstalling
 * the agent never reopens old customers' viewing window). `onlyFolder` = manual resend.
 * Nothing older than `notBeforeMs` (default UPLOAD_FROM_MS, 25/11/2026) is ever returned.
 */
export async function scanExports(root: string, options: { sinceMs?: number; onlyFolder?: string; notBeforeMs?: number } = {}): Promise<ScanResult> {
  const sinceMs = Math.max(options.sinceMs ?? 0, options.notBeforeMs ?? UPLOAD_FROM_MS)
  const jobs: QueueJob[] = []
  const unrecognized = new Set<string>()
  const sessions = (await readdir(root, { withFileTypes: true })).filter((entry) => entry.isDirectory() && !entry.name.startsWith('.') && (!options.onlyFolder || entry.name === options.onlyFolder))
  for (const session of sessions) {
    let files: string[]
    try { files = await outputFiles(root, session.name, sinceMs) } catch { continue }
    for (const file of files) {
      const classified = classifyExport(file, root)
      if (!classified) continue
      try { if ((await stat(file)).mtimeMs < sinceMs) continue } catch { continue }
      if (classified.kind === 'unrecognized') unrecognized.add(classified.sessionFolder)
      else jobs.push({ filePath: file, phone: classified.phone, sessionFolder: classified.sessionFolder })
    }
  }
  return { jobs, unrecognized: [...unrecognized] }
}


/**
 * Drops exports already uploaded (same path + size + mtime) before they reach the queue,
 * so rescans never re-read, re-hash or wait on finished files. The server's SHA-256
 * check is the last guard: identical content is never stored twice.
 */
/** Live file events use the same floor as scans. */
export async function isOnOrAfterUploadFrom(file: string, notBeforeMs = UPLOAD_FROM_MS) {
  try { return (await stat(file)).mtimeMs >= notBeforeMs } catch { return false }
}

export async function pendingJobs(jobs: QueueJob[], state: StateStore, statImpl: (file: string) => Promise<{ size: number; mtimeMs: number }> = stat) {
  const pending: QueueJob[] = []
  for (const job of jobs) {
    try {
      const info = await statImpl(job.filePath)
      if (!state.has(StateStore.key(job.filePath, info.size, info.mtimeMs))) pending.push(job)
    } catch { /* deleted or still locked: next rescan */ }
  }
  return pending
}
