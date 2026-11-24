import { readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { classifyExport } from './phoneFolder.ts'
import { StateStore } from './stateStore.ts'
import type { QueueJob } from './queue.ts'

// Matches the 12-hour Supabase retention: older photos are already deleted online, so a
// reinstall must not send them again (staff use "Gửi lại thư mục" when a customer needs one).
export const AUTOMATIC_RESCAN_MS = 12 * 60 * 60_000
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
 * Startup scan: Output JPEGs modified since `sinceMs` (12 h by default, so reinstalling
 * the agent never reopens old customers' viewing window). `onlyFolder` = manual resend.
 */
export async function scanExports(root: string, options: { sinceMs?: number; onlyFolder?: string } = {}): Promise<ScanResult> {
  const jobs: QueueJob[] = []
  const unrecognized = new Set<string>()
  const sessions = (await readdir(root, { withFileTypes: true })).filter((entry) => entry.isDirectory() && !entry.name.startsWith('.') && (!options.onlyFolder || entry.name === options.onlyFolder))
  for (const session of sessions) {
    let files: string[]
    try { files = await outputFiles(root, session.name, options.sinceMs) } catch { continue }
    for (const file of files) {
      const classified = classifyExport(file, root)
      if (!classified) continue
      if (options.sinceMs !== undefined) {
        try { if ((await stat(file)).mtimeMs < options.sinceMs) continue } catch { continue }
      }
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
