import { useState } from 'react'
import { PrintPreview } from '../components/export/PrintPreview'
import { PageShell } from '../components/layout/PageShell'
import { PrimaryButton } from '../components/ui/PrimaryButton'
import { useBranding } from '../contexts/BrandingContext'
import { downloadComposition } from '../features/orders/services/downloadComposition'
import type { CustomerTemplate } from '../services/catalog/types'
import type { FilledSlot } from '../types/selfBooth'

interface RoomSummaryPageProps {
  roomName: string
  templates: CustomerTemplate[]
  frameSlots: Record<string, Array<FilledSlot | null>>
  completedFrameIds: string[]
  previewUrls: Record<string, string>
  onEdit: (index: number) => void
  onRemove: (templateId: string) => Promise<void>
  onSubmit: () => Promise<string>
  onSuccess: (orderId: string) => void
}

export function RoomSummaryPage({ roomName, templates, frameSlots, completedFrameIds, previewUrls, onEdit, onRemove, onSubmit, onSuccess }: RoomSummaryPageProps) {
  const branding = useBranding(); const [busy, setBusy] = useState<string | null>(null); const [error, setError] = useState<string | null>(null)
  const frames = templates.map((template) => ({ template, slots: frameSlots[template.id] ?? template.slots.map(() => null) }))
  const completedFrames = frames.map((frame, index) => ({ ...frame, index })).filter(({ template, slots }) => completedFrameIds.includes(template.id) && slots.some(Boolean))
  const performDownload = async (index: number) => { const frame = frames[index]; if (frame) await downloadComposition({ branding, slots: frame.slots, template: frame.template }) }
  const run = async (key: string, action: () => Promise<void>, fallback: string) => { setBusy(key); setError(null); try { await action() } catch (reason) { setError(reason instanceof Error ? reason.message : fallback) } finally { setBusy(null) } }
  const downloadAll = () => run('all', async () => { for (const frame of completedFrames) await performDownload(frame.index) }, 'Unable to download all images.')
  const submit = () => run('submit', async () => onSuccess(await onSubmit()), 'Unable to submit the Print Order.')

  return <PageShell><header><p className="text-sm font-bold uppercase tracking-[0.2em] text-[var(--brand-primary)]">Print Order</p><h1 className="mt-2 text-3xl font-black">{roomName}</h1><p className="mt-2 text-stone-500">{completedFrameIds.length} of {templates.length} images completed</p><div aria-label={`Room completion: ${completedFrameIds.length} of ${templates.length}`} aria-valuemax={templates.length} aria-valuemin={0} aria-valuenow={completedFrameIds.length} className="mt-4 h-2 overflow-hidden rounded-full bg-stone-200" role="progressbar"><div className="h-full bg-[var(--brand-primary)] transition-[width]" style={{ width: `${templates.length ? completedFrameIds.length / templates.length * 100 : 0}%` }} /></div></header>
    <section className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{frames.map(({ template, slots }, index) => <article className="overflow-hidden rounded-[1.75rem] bg-white p-4 shadow-sm" key={template.id}>{previewUrls[template.id] ? <img alt={`Frame ${index + 1} preview`} className="mx-auto max-h-80 w-full rounded-xl object-contain" src={previewUrls[template.id]} /> : <PrintPreview slots={slots} template={template} />}<div className="mt-3 flex items-center justify-between gap-2"><div><p className="font-bold">Frame {index + 1}</p><p className={`text-xs font-semibold ${completedFrameIds.includes(template.id) ? 'text-emerald-600' : 'text-amber-600'}`}>{completedFrameIds.includes(template.id) ? 'In Print Order' : 'Unfinished'}</p></div><div className="flex flex-wrap justify-end gap-2"><button className="min-h-10 rounded-xl bg-stone-100 px-3 text-sm font-bold" onClick={() => onEdit(index)} type="button">Re-edit</button><button className="min-h-10 rounded-xl bg-rose-50 px-3 text-sm font-bold text-rose-700 disabled:opacity-40" disabled={!completedFrameIds.includes(template.id) || busy !== null} onClick={() => run(`remove-${template.id}`, () => onRemove(template.id), 'Unable to remove this image.')} type="button">Remove</button><button className="min-h-10 rounded-xl bg-stone-950 px-3 text-sm font-bold text-white disabled:opacity-40" disabled={!slots.every(Boolean) || busy !== null} onClick={() => run(`frame-${index}`, () => performDownload(index), 'Unable to download this image.')} type="button">Download</button></div></div></article>)}</section>
    {error ? <p className="mt-5 rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-700" role="alert">{error}</p> : null}
    <div className="mx-auto mt-8 grid max-w-xl gap-3"><button className="min-h-14 rounded-2xl border border-stone-300 bg-white font-bold disabled:opacity-40" disabled={!completedFrames.length || busy !== null} onClick={downloadAll} type="button">{busy === 'all' ? 'Downloading…' : 'Download All'}</button><p className="text-center text-xs font-semibold text-stone-500">{completedFrames.length} completed {completedFrames.length === 1 ? 'image' : 'images'} ready</p><PrimaryButton disabled={!completedFrames.length || busy !== null} onClick={submit}>{busy === 'submit' ? 'Submitting…' : 'Submit Print Order'}</PrimaryButton></div>
  </PageShell>
}
