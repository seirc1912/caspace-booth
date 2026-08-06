import type { FilledSlot, PrintTemplate } from '../../types/selfBooth'

export type OrderStatus = 'Pending'

export interface OrderMetadata {
  orderId: string
  templateId: string
  createdAt: string
  status: OrderStatus
  device: string
  browser: string
}

export interface CreateOrderInput {
  template: PrintTemplate
  slots: Array<FilledSlot | null>
}

export interface OrderArtifacts {
  print: Blob
  preview: Blob
  metadata: Blob
}

export interface PrintOrder {
  metadata: OrderMetadata
  artifacts: OrderArtifacts
}
