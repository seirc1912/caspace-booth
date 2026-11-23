import { stat } from 'node:fs/promises'

type StatFn = (path: string) => Promise<{ size: number }>

/** Capture One writes JPEGs progressively: wait until the size stops changing. */
export async function waitUntilStable(path: string, options: { checks?: number; intervalMs?: number; timeoutMs?: number; statImpl?: StatFn; sleep?: (ms: number) => Promise<void> } = {}) {
  const { checks = 3, intervalMs = 500, timeoutMs = 60_000, statImpl = stat, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) } = options
  let previous = -1
  let stable = 0
  for (let waited = 0; waited <= timeoutMs; waited += intervalMs) {
    try {
      const { size } = await statImpl(path)
      stable = size > 0 && size === previous ? stable + 1 : 0
      previous = size
      if (stable >= checks) return size
    } catch { stable = 0; previous = -1 }
    await sleep(intervalMs)
  }
  throw new Error('FILE_NOT_STABLE')
}
