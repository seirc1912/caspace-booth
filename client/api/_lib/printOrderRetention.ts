import type { SupabaseClient } from '@supabase/supabase-js'
import { listAll } from './photoRetention.js'

// Owner decision (25/11/2026): every print order — whatever its status — and its rendered frames
// are deleted 6 hours after the customer sent it (drafts: 6 hours after their last change).
// Unprinted orders disappear from the print queue; the customer composes and sends again.
export const PRINT_ORDER_RETENTION_HOURS = 6
export const PRINT_ORDER_BUCKET = 'print-orders'
const PAGE = 1_000
const LIST_CONCURRENCY = 8

/** Database side of the print queue, kept small so the cleanup can be tested without Supabase. */
export interface PrintOrderStore {
  /** Ids of orders still inside the window (sent, or last changed if a draft, at/after `cutoffIso`). */
  liveOrderIds(cutoffIso: string): Promise<Set<string>>
  /** Ids of orders outside the window. */
  expiredOrderIds(cutoffIso: string): Promise<string[]>
  /** Deletes orders (their items cascade). Returns how many were deleted. */
  deleteOrders(ids: string[]): Promise<number>
}

const expiredFilter = (cutoffIso: string) => `submitted_at.lt.${cutoffIso},and(submitted_at.is.null,updated_at.lt.${cutoffIso})`
const liveFilter = (cutoffIso: string) => `submitted_at.gte.${cutoffIso},and(submitted_at.is.null,updated_at.gte.${cutoffIso})`

async function selectIds(client: SupabaseClient, filter: string) {
  const ids: string[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await client.from('print_orders').select('id').or(filter).order('id').range(from, from + PAGE - 1)
    if (error) throw error
    ids.push(...(data as Array<{ id: string }>).map((row) => row.id))
    if (data.length < PAGE) return ids
  }
}

export function supabasePrintOrderStore(client: SupabaseClient): PrintOrderStore {
  return {
    liveOrderIds: async (cutoffIso) => new Set(await selectIds(client, liveFilter(cutoffIso))),
    expiredOrderIds: (cutoffIso) => selectIds(client, expiredFilter(cutoffIso)),
    async deleteOrders(ids) {
      let deleted = 0
      for (let index = 0; index < ids.length; index += 100) {
        const batch = ids.slice(index, index + 100)
        const { error } = await client.from('print_orders').delete().in('id', batch)
        if (error) throw error
        deleted += batch.length
      }
      return deleted
    },
  }
}

/**
 * Files are `{phone}/{orderId}/NN.png`. A file is deleted when it is older than the cutoff and its
 * order is not live (expired, or never recorded / already deleted), so a live order never loses a frame.
 */
export async function planPrintOrderCleanup(client: SupabaseClient, store: PrintOrderStore, cutoff: number) {
  const cutoffIso = new Date(cutoff).toISOString()
  const live = await store.liveOrderIds(cutoffIso)
  const phones = (await listAll(client, '', 'name', PRINT_ORDER_BUCKET)).filter((entry) => entry.id === null).map((entry) => entry.name)
  const orderFolders: Array<{ prefix: string; orderId: string }> = []
  for (let index = 0; index < phones.length; index += LIST_CONCURRENCY) {
    const batch = phones.slice(index, index + LIST_CONCURRENCY)
    const listings = await Promise.all(batch.map((phone) => listAll(client, phone, 'name', PRINT_ORDER_BUCKET)))
    listings.forEach((entries, position) => {
      for (const entry of entries) if (entry.id === null && !live.has(entry.name)) orderFolders.push({ prefix: `${batch[position]}/${entry.name}`, orderId: entry.name })
    })
  }
  const files: string[] = []
  for (let index = 0; index < orderFolders.length; index += LIST_CONCURRENCY) {
    const batch = orderFolders.slice(index, index + LIST_CONCURRENCY)
    const listings = await Promise.all(batch.map((folder) => listAll(client, folder.prefix, 'created_at', PRINT_ORDER_BUCKET)))
    listings.forEach((objects, position) => {
      for (const object of objects) {
        const writtenAt = Date.parse(object.updated_at ?? object.created_at ?? '')
        if (object.id && Number.isFinite(writtenAt) && writtenAt < cutoff) files.push(`${batch[position]!.prefix}/${object.name}`)
      }
    })
  }
  return { files, orders: await store.expiredOrderIds(cutoffIso) }
}

/** Files first, then the orders, so a failed run never leaves an order pointing at nothing it can retry. */
export async function applyPrintOrderCleanup(client: SupabaseClient, store: PrintOrderStore, plan: { files: string[]; orders: string[] }) {
  let removedFiles = 0
  for (let index = 0; index < plan.files.length; index += 100) {
    const batch = plan.files.slice(index, index + 100)
    const result = await client.storage.from(PRINT_ORDER_BUCKET).remove(batch)
    if (result.error) throw result.error
    removedFiles += batch.length
  }
  const removedOrders = await store.deleteOrders(plan.orders)
  return { removedFiles, removedOrders }
}
