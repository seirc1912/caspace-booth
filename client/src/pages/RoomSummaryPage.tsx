import { useState } from 'react'
import { PrintPreview } from '../components/export/PrintPreview'
import { PageShell } from '../components/layout/PageShell'
import { PrimaryButton } from '../components/ui/PrimaryButton'
import { useBranding } from '../contexts/BrandingContext'
import { downloadComposition } from '../features/orders/services/downloadComposition'
import { orderService } from '../features/orders/services/orderServiceInstance'
import type { FilledSlot } from '../types/selfBooth'
import type { CustomerTemplate } from '../services/catalog/RoomCatalogService'

interface RoomSummaryPageProps {
  roomName: string
  roomId: string
  phoneNumber: string
  templates: CustomerTemplate[]
  frameSlots: Record<string, Array<FilledSlot | null>>
  completedFrameIds: string[]
  previewUrls: Record<string, string>
  onEdit: (index: number) => void
  onSuccess: (orderId: string) => void
}

export function RoomSummaryPage({ roomName, roomId, phoneNumber, templates, frameSlots, completedFrameIds, previewUrls, onEdit, onSuccess }: RoomSummaryPageProps) {
  const branding = useBranding()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const frames = templates.map((template) => ({ template, slots: frameSlots[template.id] ?? template.slots.map(() => null) }))
  const allComplete = frames.length > 0 && frames.every(({ template, slots }) => completedFrameIds.includes(template.id) && slots.every(Boolean))
  const downloadFrame = async (index: number) => {
    const frame = frames[index]; if (!frame) return
    setBusy(`frame-${index}`); setError(null)
    try { await downloadComposition({ branding, slots: frame.slots, template: frame.template }) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to download this frame.') }
    finally { setBusy(null) }
  }
  const downloadAll = async () => {
    setBusy('all'); setError(null)
    try { for (let index = 0; index < frames.length; index += 1) await downloadFrame(index) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to download all frames.') }
    finally { setBusy(null) }
  }
  const submit = async () => {
    if (!frames[0]) return
    setBusy('submit'); setError(null)
    try { const order = await orderService.create({ ...frames[0], frames, phoneNumber, roomId }); onSuccess(order.metadata.orderId) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to submit the room order.') }
    finally { setBusy(null) }
  }
  return <PageShell><header><p className="text-sm font-bold uppercase tracking-[0.2em] text-[var(--brand-primary)]">Room summary</p><h1 className="mt-2 text-3xl font-black">{roomName}</h1><p className="mt-2 text-stone-500">{completedFrameIds.length} of {templates.length} frames completed</p><div className="mt-4 h-2 overflow-hidden rounded-full bg-stone-200"><div className="h-full bg-[var(--brand-primary)] transition-[width]" style={{ width: `${templates.length ? completedFrameIds.length / templates.length * 100 : 0}%` }} /></div></header>
    <section className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{frames.map(({ template, slots }, index) => <article className="overflow-hidden rounded-[1.75rem] bg-white p-4 shadow-sm" key={template.id}>{previewUrls[template.id] ? <img alt={`Frame ${index + 1} preview`} className="mx-auto max-h-80 w-full rounded-xl object-contain" src={previewUrls[template.id]} /> : <PrintPreview slots={slots} template={template} />}<div className="mt-3 flex items-center justify-between gap-2"><div><p className="font-bold">Frame {index + 1}</p><p className={`text-xs font-semibold ${completedFrameIds.includes(template.id) ? 'text-emerald-600' : 'text-amber-600'}`}>{completedFrameIds.includes(template.id) ? 'Completed' : 'Unfinished'}</p></div><div className="flex gap-2"><button className="min-h-10 rounded-xl bg-stone-100 px-3 text-sm font-bold" onClick={() => onEdit(index)} type="button">Edit</button><button className="min-h-10 rounded-xl bg-stone-950 px-3 text-sm font-bold text-white disabled:opacity-40" disabled={!slots.every(Boolean) || busy !== null} onClick={() => downloadFrame(index)} type="button">Download</button></div></div></article>)}</section>
    {error ? <p className="mt-5 rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-700" role="alert">{error}</p> : null}
    <div className="mx-auto mt-8 grid max-w-xl gap-3"><button className="min-h-14 rounded-2xl border border-stone-300 bg-white font-bold disabled:opacity-40" disabled={!allComplete || busy !== null} onClick={downloadAll} type="button">{busy === 'all' ? 'Downloading…' : 'Download All'}</button><PrimaryButton disabled={!allComplete || busy !== null} onClick={submit}>{busy === 'submit' ? 'Submitting…' : 'Submit Print Order'}</PrimaryButton></div>
  </PageShell>
}
