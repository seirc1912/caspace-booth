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

export interface PrintOrderRepository {
  createDraft(phoneNumber: string, roomId: string): Promise<PrintOrderDraft>
  addItem(draft: PrintOrderDraft, phoneNumber: string, templateId: string, image: Blob, displayOrder: number): Promise<PrintOrderItem>
  removeItem(draft: PrintOrderDraft, item: PrintOrderItem): Promise<void>
  submit(draft: PrintOrderDraft): Promise<PrintQueueOrder>
  listQueue(): Promise<PrintQueueOrder[]>
  listItems(orderId: string): Promise<PrintOrderItem[]>
  updateStatus(orderId: string, status: PrintOrderStatus): Promise<void>
  deleteOrder(order: PrintQueueOrder, items: PrintOrderItem[]): Promise<void>
}
