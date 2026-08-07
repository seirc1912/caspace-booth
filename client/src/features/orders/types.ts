import type { FilledSlot, PrintTemplate } from '../../types/selfBooth'

export type OrderStatus = 'Pending'

export interface OrderMetadata {
  orderId: string
  templateId: string
  createdAt: string
  status: OrderStatus
  device: string
  browser: string
  phoneNumber: string
  roomId: string
  frameIds?: string[]
  frames?: Array<{ templateId: string; slots: Array<{ photoId: string; transform: FilledSlot['transform']; fit?: FilledSlot['fit'] }> }>
}

export interface OrderFrameInput { template: PrintTemplate; slots: Array<FilledSlot | null> }

export interface CreateOrderInput {
  template: PrintTemplate
  slots: Array<FilledSlot | null>
  phoneNumber: string
  roomId: string
  frames?: OrderFrameInput[]
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
