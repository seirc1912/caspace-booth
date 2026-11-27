import type { TransferTiming } from './uploader.ts'

export interface SpeedSummary { photos: number; avgSeconds: number; avgPhotoSeconds: number; mbps: number }

const mbps = (bytes: number, ms: number) => (bytes * 8) / (ms / 1000) / 1_000_000

/**
 * Last 20 originals actually sent: average PUT time and per-photo speed, plus the average
 * time for the whole photo (original + thumbnail + preview, including API calls).
 * Shown on the status page so staff can tell a slow PC from a slow evening network.
 */
export class TransferStats {
  private readonly recent: Array<TransferTiming & { photoMs: number }> = []
  constructor(private readonly keep = 20) {}

  add(transfer: TransferTiming, photoMs: number) {
    this.recent.push({ ...transfer, photoMs })
    if (this.recent.length > this.keep) this.recent.shift()
  }

  summary(): SpeedSummary | null {
    if (!this.recent.length) return null
    const n = this.recent.length
    const sum = (pick: (item: (typeof this.recent)[number]) => number) => this.recent.reduce((total, item) => total + pick(item), 0)
    return {
      photos: n,
      avgSeconds: sum((item) => item.ms) / n / 1000,
      avgPhotoSeconds: sum((item) => item.photoMs) / n / 1000,
      mbps: sum((item) => mbps(item.bytes, item.ms)) / n,
    }
  }
}

export function describeTransfer(transfer: TransferTiming) {
  return `${(transfer.bytes / 1_048_576).toFixed(1)} MB trong ${(transfer.ms / 1000).toFixed(1)}s (${mbps(transfer.bytes, transfer.ms).toFixed(1)} Mbps)`
}
