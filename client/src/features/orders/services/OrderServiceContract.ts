import type { CreateOrderInput, PrintOrder } from '../types'

export interface OrderService {
  create(input: CreateOrderInput): Promise<PrintOrder>
  downloadPreview(input: CreateOrderInput): Promise<void>
}
