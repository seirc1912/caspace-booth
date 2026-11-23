import notifier from 'node-notifier'

const shown = new Set<string>()

/** Windows toast, at most once per message key (e.g. one per badly named folder). */
export function notifyOnce(key: string, title: string, message: string) {
  if (shown.has(key)) return
  shown.add(key)
  try { notifier.notify({ title, message, appID: 'Caspace Booth Agent' }) } catch { /* toast is best-effort */ }
}
