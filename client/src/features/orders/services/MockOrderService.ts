import type { CreateOrderInput, OrderMetadata, PrintOrder } from '../types'
import type { OrderService } from './OrderServiceContract'
import { renderComposition } from './renderComposition'

const counterKey = 'selfbooth.mock-order-counter'

const nextOrderId = () => {
  const sequence = Number(localStorage.getItem(counterKey) ?? '0') + 1
  localStorage.setItem(counterKey, String(sequence))
  return `CS-${String(sequence).padStart(6, '0')}`
}

const download = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

const deviceName = () => /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ? 'Mobile' : 'Desktop'
const browserName = () => navigator.userAgent

export class MockOrderService implements OrderService {
  async create({ template, slots, phoneNumber, roomId }: CreateOrderInput): Promise<PrintOrder> {
    if (!slots.length || slots.some((slot) => !slot)) throw new Error('Fill every photo slot before submitting the order')
    const orderId = nextOrderId()
    const metadata: OrderMetadata = { orderId, templateId: template.id, phoneNumber, roomId, createdAt: new Date().toISOString(), status: 'Pending', device: deviceName(), browser: browserName() }
    const history = JSON.parse(localStorage.getItem('selfbooth.mock-orders') ?? '[]') as OrderMetadata[]
    localStorage.setItem('selfbooth.mock-orders', JSON.stringify([...history.slice(-49), metadata]))
    const rendered = await renderComposition(template, slots)
    const metadataBlob = new Blob([JSON.stringify(metadata, null, 2)], { type: 'application/json' })
    download(rendered.print, 'print.png')
    download(rendered.preview, 'preview.jpg')
    download(metadataBlob, 'metadata.json')
    return { metadata, artifacts: { ...rendered, metadata: metadataBlob } }
  }

  async downloadPreview({ template, slots }: CreateOrderInput) {
    const { print } = await renderComposition(template, slots)
    download(print, 'caspace-print.png')
  }
}
