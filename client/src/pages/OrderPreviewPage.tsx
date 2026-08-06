import { useState } from 'react'
import { PrintPreview } from '../components/export/PrintPreview'
import { PageShell } from '../components/layout/PageShell'
import { PrimaryButton } from '../components/ui/PrimaryButton'
import { orderService } from '../features/orders/services/orderServiceInstance'
import type { FilledSlot, PrintTemplate } from '../types/selfBooth'

interface OrderPreviewPageProps {
  template: PrintTemplate
  slots: Array<FilledSlot | null>
  onBack: () => void
  onSuccess: (orderId: string) => void
  phoneNumber: string
  roomId: string
}

export function OrderPreviewPage({ template, slots, phoneNumber, roomId, onBack, onSuccess }: OrderPreviewPageProps) {
  const service = orderService
  const [zoom, setZoom] = useState(1)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const input = { template, slots, phoneNumber, roomId }
  const submit = async () => { setSubmitting(true); setError(null); try { const order = await service.create(input); onSuccess(order.metadata.orderId) } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to submit order') } finally { setSubmitting(false) } }
  return <PageShell><header className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-bold uppercase tracking-[0.2em] text-[var(--brand-primary)]">Step 5 of 6 · Final preview</p><h1 className="mt-2 text-3xl font-bold">Your print is ready.</h1><p className="mt-2 text-stone-500">Check every photo, then save it or send it to the studio.</p></div><button className="min-h-11 rounded-xl bg-white px-4 text-sm font-semibold shadow-sm" onClick={() => setZoom((value) => value === 1 ? 1.5 : 1)} type="button">{zoom === 1 ? 'Zoom preview' : 'Fit preview'}</button></header><div className="mx-auto mt-8 w-full max-w-xl overflow-auto"><div style={{ transform: `scale(${zoom})`, transformOrigin: 'top center' }}><PrintPreview slots={slots} template={template} /></div></div>{error ? <p className="mx-auto mt-5 max-w-xl rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-700" role="alert">{error}</p> : null}<div className="mx-auto mt-8 grid max-w-xl gap-3"><button className="min-h-14 rounded-2xl border border-stone-300 bg-white px-5 font-bold shadow-sm" onClick={() => service.downloadPreview(input)} type="button">Save to Device</button><PrimaryButton disabled={submitting || !slots.every(Boolean)} onClick={submit}>{submitting ? 'Preparing order…' : 'Send Print Order'}</PrimaryButton><button className="min-h-12 rounded-xl font-semibold text-stone-600 hover:bg-white" onClick={onBack} type="button">Back to editor</button></div></PageShell>
}
