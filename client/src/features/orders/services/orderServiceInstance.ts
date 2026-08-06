import { MockOrderService } from './MockOrderService'
import type { OrderService } from './OrderServiceContract'

// Replace this binding with an API-backed implementation without changing customer UI.
export const orderService: OrderService = new MockOrderService()
