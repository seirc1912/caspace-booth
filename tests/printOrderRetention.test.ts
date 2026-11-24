import assert from 'node:assert/strict'
import test from 'node:test'
import { applyPrintOrderCleanup, planPrintOrderCleanup, PRINT_ORDER_BUCKET, PRINT_ORDER_RETENTION_HOURS, type PrintOrderStore } from '../client/api/_lib/printOrderRetention.ts'

const at = Date.parse('2026-11-25T12:00:00Z')
const hoursAgo = (hours: number) => new Date(at - hours * 3_600_000).toISOString()

function fakes() {
  const tree: Record<string, Array<{ id: string | null; name: string; created_at: string | null }>> = {
    '': [{ id: null, name: '0947860616', created_at: null }, { id: null, name: '0912345678', created_at: null }],
    '0947860616': [{ id: null, name: 'order-old-pending', created_at: null }, { id: null, name: 'order-live', created_at: null }],
    '0947860616/order-old-pending': [{ id: 'a', name: '01.png', created_at: hoursAgo(8) }, { id: 'b', name: '02.png', created_at: hoursAgo(8) }],
    // Live order (sent 1 h ago) whose frames were rendered 9 h ago: must be kept.
    '0947860616/order-live': [{ id: 'c', name: '01.png', created_at: hoursAgo(9) }],
    '0912345678': [{ id: null, name: 'order-gone', created_at: null }],
    // Folder whose order row no longer exists: old file removed, fresh file kept.
    '0912345678/order-gone': [{ id: 'd', name: '01.png', created_at: hoursAgo(7) }, { id: 'e', name: '02.png', created_at: hoursAgo(1) }],
  }
  const removedFiles: string[][] = []
  const buckets: string[] = []
  const client = { storage: { from: (bucket: string) => {
    buckets.push(bucket)
    return {
      list: async (prefix: string, options: { limit: number; offset: number }) => ({ error: null, data: (tree[prefix] ?? []).slice(options.offset, options.offset + options.limit) }),
      remove: async (paths: string[]) => { removedFiles.push(paths); return { error: null, data: [] } },
    }
  } } } as never
  const deleted: string[][] = []
  const calls: string[] = []
  const store: PrintOrderStore = {
    liveOrderIds: async (cutoffIso) => { calls.push(`live:${cutoffIso}`); return new Set(['order-live']) },
    expiredOrderIds: async (cutoffIso) => { calls.push(`expired:${cutoffIso}`); return ['order-old-pending', 'order-old-completed'] },
    deleteOrders: async (ids) => { calls.push('delete'); deleted.push(ids); return ids.length },
  }
  return { client, store, removedFiles, deleted, calls, buckets }
}

test('print orders of any status are removed 6 hours after sending; live orders keep every frame', async () => {
  assert.equal(PRINT_ORDER_RETENTION_HOURS, 6)
  const { client, store, calls, buckets } = fakes()
  const plan = await planPrintOrderCleanup(client, store, at - PRINT_ORDER_RETENTION_HOURS * 3_600_000)
  assert.deepEqual(plan.files.sort(), ['0912345678/order-gone/01.png', '0947860616/order-old-pending/01.png', '0947860616/order-old-pending/02.png'])
  assert.deepEqual(plan.orders, ['order-old-pending', 'order-old-completed'])
  assert.ok(calls.includes(`live:${hoursAgo(6)}`))
  assert.ok(buckets.every((bucket) => bucket === PRINT_ORDER_BUCKET), 'only the print-orders bucket is touched')
})

test('applying removes files before order rows, in batches of 100', async () => {
  const { client, store, removedFiles, deleted, calls } = fakes()
  const files = Array.from({ length: 150 }, (_, index) => `p/o/${index}.png`)
  const result = await applyPrintOrderCleanup(client, { ...store, deleteOrders: async (ids) => { calls.push(`delete-after-${removedFiles.length}-file-batches`); deleted.push(ids); return ids.length } }, { files, orders: ['x', 'y'] })
  assert.deepEqual(result, { removedFiles: 150, removedOrders: 2 })
  assert.deepEqual(removedFiles.map((batch) => batch.length), [100, 50])
  assert.deepEqual(calls, ['delete-after-2-file-batches'])
})

test('cron also runs the print-order cleanup, still dry-run unless enabled', async () => {
  const { readFileSync } = await import('node:fs')
  const source = readFileSync('client/api/cron/cleanup-photo-uploads.ts', 'utf8')
  assert.match(source, /if \(apply\) printRemoved = await applyPrintOrderCleanup\(/)
  assert.match(source, /PRINT_ORDER_RETENTION_HOURS \* 3_600_000/)
})
