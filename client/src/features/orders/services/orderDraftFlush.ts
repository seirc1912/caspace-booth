type DraftFlushWarning = (message: string, diagnostic: { errorClass: string }) => void

export async function flushOrderDraftBestEffort(
  flush: () => Promise<void>,
  warn: DraftFlushWarning = console.warn,
) {
  try { await flush() }
  catch (reason) {
    warn('[print-order] draft persistence unavailable; continuing with in-memory photos', {
      errorClass: reason instanceof Error ? reason.name : 'UnknownError',
    })
  }
}
