import { readFile, stat } from 'node:fs/promises'
import { waitUntilStable } from './stableFile.ts'
import { StateStore } from './stateStore.ts'
import { AgentUploadError, uploadExport, type BoothApi } from './uploader.ts'

export interface QueueJob { filePath: string; phone: string; sessionFolder: string }
export interface QueueDeps {
  api: BoothApi
  state: StateStore
  makeThumbnail: (bytes: Buffer) => Promise<Buffer>
  makePreview?: (bytes: Buffer) => Promise<Buffer>
  concurrency?: number
  waitStable?: (path: string) => Promise<number>
  statImpl?: (path: string) => Promise<{ size: number; mtimeMs: number }>
  readImpl?: (path: string) => Promise<Buffer>
  upload?: typeof uploadExport
  sleep?: (ms: number) => Promise<void>
  onEvent?: (event: QueueEvent) => void
}
export type QueueEvent =
  | { type: 'uploaded'; job: QueueJob; alreadyUploaded: boolean }
  | { type: 'retry'; job: QueueJob; attempt: number; delayMs: number; reason: string }
  | { type: 'failed'; job: QueueJob; reason: string }

const MAX_PERMANENT_ATTEMPTS = 3

/** Serial (or 2-lane) upload queue: never blocks Capture One, retries network errors forever. */
export class UploadQueue {
  private readonly pending: QueueJob[] = []
  private readonly known = new Set<string>()
  private active = 0
  private idleResolvers: Array<() => void> = []
  readonly failures = new Map<string, string>()
  uploadedCount = 0

  constructor(private readonly deps: QueueDeps) {}

  get pendingCount() { return this.pending.length + this.active }

  enqueue(job: QueueJob) {
    if (this.known.has(job.filePath)) return
    this.known.add(job.filePath)
    this.failures.delete(job.filePath)
    this.pending.push(job)
    this.pump()
  }

  idle() { return this.pendingCount === 0 ? Promise.resolve() : new Promise<void>((resolve) => this.idleResolvers.push(resolve)) }

  private pump() {
    const lanes = Math.min(2, Math.max(1, this.deps.concurrency ?? 1))
    while (this.active < lanes && this.pending.length) {
      const job = this.pending.shift()!
      this.active += 1
      void this.run(job).finally(() => {
        this.active -= 1
        this.known.delete(job.filePath)
        this.pump()
        if (this.pendingCount === 0) this.idleResolvers.splice(0).forEach((resolve) => resolve())
      })
    }
  }

  private async run(job: QueueJob) {
    const { state, api, makeThumbnail, makePreview } = this.deps
    const waitStable = this.deps.waitStable ?? ((path: string) => waitUntilStable(path))
    const statImpl = this.deps.statImpl ?? stat
    const readImpl = this.deps.readImpl ?? readFile
    const upload = this.deps.upload ?? uploadExport
    const sleep = this.deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))
    let permanentFailures = 0
    for (let attempt = 1; ; attempt += 1) {
      try {
        await waitStable(job.filePath)
        const info = await statImpl(job.filePath)
        const key = StateStore.key(job.filePath, info.size, info.mtimeMs)
        if (state.has(key)) return
        const bytes = await readImpl(job.filePath)
        const result = await upload({ api, phone: job.phone, filePath: job.filePath, bytes, makeThumbnail, makePreview })
        state.mark(key, result.objectPath)
        this.uploadedCount += 1
        this.deps.onEvent?.({ type: 'uploaded', job, alreadyUploaded: result.alreadyUploaded })
        return
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        const retryable = !(error instanceof AgentUploadError) || error.retryable
        if (!retryable && ++permanentFailures >= MAX_PERMANENT_ATTEMPTS) {
          this.failures.set(job.filePath, reason)
          this.deps.onEvent?.({ type: 'failed', job, reason })
          return
        }
        const delayMs = Math.min(60_000, 2_000 * 2 ** Math.min(attempt - 1, 5))
        this.deps.onEvent?.({ type: 'retry', job, attempt, delayMs, reason })
        await sleep(delayMs)
      }
    }
  }
}
