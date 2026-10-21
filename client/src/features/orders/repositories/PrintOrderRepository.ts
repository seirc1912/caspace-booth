export type PrintOrderStatus = 'Pending' | 'Printing' | 'Completed' | 'Cancelled'

export interface PrintOrderDraft { id: string; editToken: string }
export interface PrintOrderItem {
  id: string
  orderId: string
  templateId: string
  templateName?: string
  storagePath: string
  displayOrder: number
  createdAt: string
  imageUrl: string
}
export interface PrintQueueOrder {
  id: string
  phoneNumber: string
  roomId: string
  roomName: string
  totalImages: number
  status: PrintOrderStatus
  submittedAt: string
  createdAt: string
  updatedAt: string
}

export const newestPrintOrdersFirst = (orders: PrintQueueOrder[]) => [...orders].sort((left, right) => {
  const submitted = Date.parse(right.submittedAt) - Date.parse(left.submittedAt)
  return submitted || Date.parse(right.createdAt) - Date.parse(left.createdAt) || right.id.localeCompare(left.id)
})

export interface PrintOrderRepository {
  createDraft(phoneNumber: string, roomId: string): Promise<PrintOrderDraft>
  addItem(draft: PrintOrderDraft, phoneNumber: string, templateId: string, image: Blob, displayOrder: number, onTiming?: (timing: { uploadMs: number; itemRpcMs: number }) => void): Promise<PrintOrderItem>
  removeItem(draft: PrintOrderDraft, item: PrintOrderItem): Promise<void>
  submit(draft: PrintOrderDraft): Promise<PrintQueueOrder>
  releaseDraft(draft: PrintOrderDraft): void
  listQueue(): Promise<PrintQueueOrder[]>
  listItems(orderId: string): Promise<PrintOrderItem[]>
  updateStatus(orderId: string, status: PrintOrderStatus): Promise<void>
  deleteOrder(order: PrintQueueOrder, items: PrintOrderItem[]): Promise<void>
}
