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
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

const deviceName = () => /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ? 'Mobile' : 'Desktop'
const browserName = () => navigator.userAgent

export class MockOrderService implements OrderService {
  async create({ template, slots, phoneNumber, roomId, frames }: CreateOrderInput): Promise<PrintOrder> {
    const orderFrames = frames?.length ? frames : [{ template, slots }]
    if (orderFrames.some((frame) => !frame.slots.length || frame.slots.some((slot) => !slot))) throw new Error('Complete every frame before submitting the order')
    const orderId = nextOrderId()
    const metadata: OrderMetadata = { orderId, templateId: template.id, frameIds: orderFrames.map((frame) => frame.template.id), frames: orderFrames.map((frame) => ({ templateId: frame.template.id, slots: frame.slots.map((slot) => ({ photoId: slot!.photo.id, transform: slot!.transform, fit: slot!.fit })) })), phoneNumber, roomId, createdAt: new Date().toISOString(), status: 'Pending', device: deviceName(), browser: browserName() }
    const history = JSON.parse(localStorage.getItem('selfbooth.mock-orders') ?? '[]') as OrderMetadata[]
    localStorage.setItem('selfbooth.mock-orders', JSON.stringify([...history.slice(-49), metadata]))
    const renderedFrames = await Promise.all(orderFrames.map((frame) => renderComposition(frame.template, frame.slots)))
    const rendered = renderedFrames[0]!
    const metadataBlob = new Blob([JSON.stringify(metadata, null, 2)], { type: 'application/json' })
    renderedFrames.forEach((frame, index) => { download(frame.print, `frame-${index + 1}.png`); download(frame.preview, `frame-${index + 1}-preview.jpg`) })
    download(metadataBlob, 'metadata.json')
    return { metadata, artifacts: { ...rendered, metadata: metadataBlob } }
  }

  async downloadPreview({ template, slots }: CreateOrderInput) {
    const { print } = await renderComposition(template, slots)
    download(print, 'caspace-print.png')
  }
}
