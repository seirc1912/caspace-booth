import { getAdminToken, supabase } from '../../../services/catalog/SupabaseCatalogService'
import type { PrintOrderDraft, PrintOrderItem, PrintOrderRepository, PrintOrderStatus, PrintQueueOrder } from './PrintOrderRepository'

const bucket = 'print-orders'
const unwrap = <T>(data: T | null, error: { message: string } | null): T => {
  if (error) throw new Error(error.message)
  if (data === null) throw new Error('Supabase returned no print-order data.')
  return data
}
const adminToken = () => {
  const token = getAdminToken()
  if (!token) throw new Error('Admin session expired. Please sign in again.')
  return token
}
const safePhone = (phone: string) => phone.replace(/[^0-9+]/g, '').replace(/^\+/, 'plus-') || 'customer'
const imageUrl = (path: string) => supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl

interface ItemRow { id: string; order_id: string; template_id: string; template_name?: string; storage_path: string; display_order: number; created_at: string }
interface OrderRow { id: string; phone_number: string; room_id: string; room_name: string; total_images: number; status: PrintOrderStatus; submitted_at: string; created_at: string; updated_at: string }
const toItem = (row: ItemRow): PrintOrderItem => ({ id: row.id, orderId: row.order_id, templateId: row.template_id, templateName: row.template_name, storagePath: row.storage_path, displayOrder: row.display_order, createdAt: row.created_at, imageUrl: imageUrl(row.storage_path) })
const toOrder = (row: OrderRow): PrintQueueOrder => ({ id: row.id, phoneNumber: row.phone_number, roomId: row.room_id, roomName: row.room_name, totalImages: row.total_images, status: row.status, submittedAt: row.submitted_at, createdAt: row.created_at, updatedAt: row.updated_at })

export class SupabasePrintOrderRepository implements PrintOrderRepository {
  async createDraft(phoneNumber: string, roomId: string) {
    const { data, error } = await supabase.rpc('customer_create_print_order', { p_phone_number: phoneNumber, p_room_id: roomId })
    const value = unwrap(data as { id: string; editToken: string } | null, error)
    return { id: value.id, editToken: value.editToken }
  }

  async addItem(draft: PrintOrderDraft, phoneNumber: string, templateId: string, image: Blob, displayOrder: number) {
    const path = `${safePhone(phoneNumber)}/${draft.id}/${String(displayOrder + 1).padStart(2, '0')}.png`
    // storage-js wraps Blob bodies in multipart FormData. Safari can terminate that
    // request with an opaque "Load failed" before Storage returns an HTTP response.
    // Raw bytes use the same endpoint and metadata without the multipart transport.
    const imageBytes = await image.arrayBuffer()
    const upload = await supabase.storage.from(bucket).upload(path, imageBytes, { contentType: 'image/png', upsert: true, metadata: { orderToken: draft.editToken } })
    if (upload.error) throw upload.error
    const result = await supabase.rpc('customer_upsert_print_order_item', { p_order_id: draft.id, p_edit_token: draft.editToken, p_template_id: templateId, p_storage_path: path, p_display_order: displayOrder })
    if (result.error) { await supabase.storage.from(bucket).remove([path]); throw result.error }
    return toItem(unwrap(result.data as ItemRow | null, result.error))
  }

  async removeItem(draft: PrintOrderDraft, item: PrintOrderItem) {
    const removed = await supabase.storage.from(bucket).remove([item.storagePath])
    if (removed.error) throw new Error(removed.error.message)
    const { error } = await supabase.rpc('customer_remove_print_order_item', { p_order_id: draft.id, p_edit_token: draft.editToken, p_template_id: item.templateId })
    if (error) throw new Error(error.message)
  }

  async submit(draft: PrintOrderDraft) {
    const { data, error } = await supabase.rpc('customer_submit_print_order', { p_order_id: draft.id, p_edit_token: draft.editToken })
    const row = unwrap(data as Omit<OrderRow, 'room_name'> | null, error)
    return toOrder({ ...row, room_name: '' })
  }

  async listQueue() {
    const { data, error } = await supabase.rpc('admin_print_orders', { p_token: adminToken() })
    return unwrap(data as OrderRow[] | null, error).map(toOrder)
  }

  async listItems(orderId: string) {
    const { data, error } = await supabase.rpc('admin_print_order_items', { p_token: adminToken(), p_order_id: orderId })
    return unwrap(data as ItemRow[] | null, error).map(toItem)
  }

  async updateStatus(orderId: string, status: PrintOrderStatus) {
    const { error } = await supabase.rpc('admin_update_print_order_status', { p_token: adminToken(), p_order_id: orderId, p_status: status })
    if (error) throw new Error(error.message)
  }

  async deleteOrder(order: PrintQueueOrder, items: PrintOrderItem[]) {
    if (items.length) {
      const removed = await supabase.storage.from(bucket).remove(items.map((item) => item.storagePath))
      if (removed.error) throw new Error(removed.error.message)
    }
    const { error } = await supabase.rpc('admin_delete_print_order', { p_token: adminToken(), p_order_id: order.id })
    if (error) throw new Error(error.message)
  }
}
