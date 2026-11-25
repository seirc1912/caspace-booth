import { readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { classifyExport, phoneFromFolderName } from './phoneFolder.ts'
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

async function outputFiles(root: string, sessionFolder: string, sinceMs?: number, checkFolderMtime = true) {
  const output = await readdir(path.join(root, sessionFolder), { withFileTypes: true })
  const folder = output.find((entry) => entry.isDirectory() && entry.name.toLowerCase() === 'output')
  if (!folder) return []
  const dir = path.join(root, sessionFolder, folder.name)
  // Adding a file updates the Output folder's mtime: old sessions are skipped without
  // touching their files, so a 30-second rescan stays cheap with hundreds of sessions.
  if (checkFolderMtime && sinceMs !== undefined && (await stat(dir)).mtimeMs < sinceMs) return []
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
    // Manual resend reads every file: Google Drive / network folders do not always update
    // the Output folder's own mtime, so the shortcut could hide a whole session.
    try { files = await outputFiles(root, session.name, sinceMs, !options.onlyFolder) } catch { continue }
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


export interface ResendFolderReport { folder: string; phone: string | null; hasOutput: boolean; jpegs: number; tooOld: number; otherFiles: number; subfolders: number }
export interface ResendPlan { folders: ResendFolderReport[]; jobs: QueueJob[] }

/**
 * "Gửi lại thư mục": staff may type the exact folder name or just the phone number
 * ("0912000111" finds "0912000111 Lan" and "0912000111-2"). Each matched folder is
 * reported, so the page can say exactly why nothing was sent.
 */
export async function planResend(root: string, input: string, notBeforeMs = UPLOAD_FROM_MS): Promise<ResendPlan> {
  const wanted = input.trim()
  const digits = wanted.replace(/[\s.-]/g, '')
  const sessions = (await readdir(root, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .filter((entry) => entry.name === wanted || (/^\d{10}$/.test(digits) && phoneFromFolderName(entry.name) === digits))
    .map((entry) => entry.name).sort()
  const folders: ResendFolderReport[] = []
  const jobs: QueueJob[] = []
  for (const folder of sessions) {
    const report: ResendFolderReport = { folder, phone: phoneFromFolderName(folder), hasOutput: false, jpegs: 0, tooOld: 0, otherFiles: 0, subfolders: 0 }
    folders.push(report)
    let entries
    try {
      const output = (await readdir(path.join(root, folder), { withFileTypes: true })).find((entry) => entry.isDirectory() && entry.name.toLowerCase() === 'output')
      if (!output) continue
      report.hasOutput = true
      const dir = path.join(root, folder, output.name)
      entries = (await readdir(dir, { withFileTypes: true })).map((entry) => ({ entry, file: path.join(dir, entry.name) }))
    } catch { continue }
    for (const { entry, file } of entries) {
      if (entry.name.startsWith('.')) continue
      if (entry.isDirectory()) { report.subfolders += 1; continue }
      if (!entry.isFile()) continue
      if (!/\.jpe?g$/i.test(entry.name)) { report.otherFiles += 1; continue }
      report.jpegs += 1
      if (!(await isOnOrAfterUploadFrom(file, notBeforeMs))) { report.tooOld += 1; continue }
      if (report.phone) jobs.push({ filePath: file, phone: report.phone, sessionFolder: folder })
    }
  }
  return { folders, jobs }
}

/** Vietnamese message for the status page after "Gửi lại". */
export function describeResend(input: string, plan: ResendPlan, watchRoot: string) {
  if (!plan.folders.length) return `Không thấy thư mục "${input}" trong ${watchRoot}. Kiểm tra lại tên thư mục hoặc số điện thoại.`
  const notes = plan.folders.flatMap((item) => {
    const sent = item.jpegs - item.tooOld
    if (!item.phone) return [`"${item.folder}" không có số điện thoại 10 số hợp lệ.`]
    if (!item.hasOutput) return [`"${item.folder}" chưa có thư mục Output (Capture One chưa xuất ảnh).`]
    if (sent > 0) return []
    if (item.jpegs > 0) return [`"${item.folder}": cả ${item.jpegs} ảnh JPG đều xuất trước 25/11/2026 nên không gửi.`]
    if (item.subfolders > 0) return [`"${item.folder}": ảnh nằm trong thư mục con của Output; app chỉ đọc ảnh nằm ngay trong Output.`]
    if (item.otherFiles > 0) return [`"${item.folder}": Output có ${item.otherFiles} file nhưng không phải ảnh JPG.`]
    return [`"${item.folder}": thư mục Output đang trống.`]
  })
  const head = plan.jobs.length ? `Đang gửi lại ${plan.jobs.length} ảnh của ${plan.folders.filter((item) => item.jpegs > item.tooOld && item.phone).map((item) => item.folder).join(', ')}.` : 'Không có ảnh nào để gửi.'
  return [head, ...notes].join(' ')
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
