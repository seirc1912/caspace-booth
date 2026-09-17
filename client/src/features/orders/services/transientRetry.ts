export const transientRetryDelays = [350, 800] as const

const message = (reason: unknown) => reason instanceof Error ? reason.message : String(reason)

export function isTransientOrderFailure(reason: unknown) {
  const value = reason as { status?: number; statusCode?: number; message?: string }
  const status = value?.status ?? value?.statusCode
  const detail = (value?.message ?? message(reason)).toLowerCase()
  if (status === 408 || status === 429 || (status !== undefined && status >= 500)) return true
  if (status !== undefined && status >= 400 && status < 500) return false
  return /network|fetch|timeout|timed out|connection|temporar|unavailable|gateway|rate limit/.test(detail)
}

export async function withTransientOrderRetry<T>(operation: () => Promise<T>, options: {
  delays?: readonly number[]
  wait?: (milliseconds: number) => Promise<void>
  timeout?: <Value>(operation: Promise<Value>) => Promise<Value>
} = {}) {
  const delays = options.delays ?? transientRetryDelays
  const wait = options.wait ?? ((milliseconds: number) => new Promise((resolve) => window.setTimeout(resolve, milliseconds)))
  const timeout = options.timeout ?? (async <Value>(operation: Promise<Value>) => operation)
  for (let attempt = 0; ; attempt += 1) {
    try { return await timeout(operation()) }
    catch (reason) {
      if (attempt >= delays.length || !isTransientOrderFailure(reason)) throw reason
      const delay = delays[attempt]!
      await wait(delay + Math.round(Math.random() * delay * 0.25))
    }
  }
}
