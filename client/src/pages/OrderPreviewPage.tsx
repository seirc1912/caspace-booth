import { useState } from 'react'
import { PrintPreview } from '../components/export/PrintPreview'
import { PageShell } from '../components/layout/PageShell'
import { PrimaryButton } from '../components/ui/PrimaryButton'
import { useBranding } from '../contexts/BrandingContext'
import { downloadComposition } from '../features/orders/services/downloadComposition'
import { printOrderRepository } from '../features/orders/services/orderServiceInstance'
import { renderComposition } from '../features/orders/services/renderComposition'
import type { ImageExportFormat } from '../features/orders/services/renderComposition'
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
  const branding = useBranding()
  const [zoom, setZoom] = useState(1)
  const [submitting, setSubmitting] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState(0)
  const [format, setFormat] = useState<ImageExportFormat>('png')
  const [exportResult, setExportResult] = useState<{ filename: string; bytes: number; width: number; height: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const submit = async () => {
    if (!slots.some(Boolean)) { setError('Please select at least one photo.'); return }
    setSubmitting(true); setError(null)
    try {
      const draft = await printOrderRepository.createDraft(phoneNumber, roomId)
      const rendered = await renderComposition(template, slots, { branding, createPreview: false })
      await printOrderRepository.addItem(draft, phoneNumber, template.id, rendered.print, 0)
      onSuccess((await printOrderRepository.submit(draft)).id)
    }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to submit order') }
    finally { setSubmitting(false) }
  }

  const exportImage = async () => {
    if (exporting) return
    setExporting(true); setExportProgress(1); setError(null); setExportResult(null)
    try { setExportResult(await downloadComposition({ branding, format, onProgress: setExportProgress, slots, template })) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to export this image.') }
    finally { setExporting(false) }
  }

  return <PageShell>
    <header className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-bold uppercase tracking-[0.2em] text-[var(--brand-primary)]">Step 5 of 6 · Final preview</p><h1 className="mt-2 text-3xl font-bold">Your print is ready.</h1><p className="mt-2 text-stone-500">Check every photo, then export it or send it to the studio.</p></div><button className="min-h-11 rounded-xl bg-white px-4 text-sm font-semibold shadow-sm" onClick={() => setZoom((value) => value === 1 ? 1.5 : 1)} type="button">{zoom === 1 ? 'Zoom preview' : 'Fit preview'}</button></header>
    <div className="mx-auto mt-8 w-full max-w-xl overflow-auto"><div style={{ transform: `scale(${zoom})`, transformOrigin: 'top center' }}><PrintPreview slots={slots} template={template} /></div></div>
    {error ? <p className="mx-auto mt-5 max-w-xl rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-700" role="alert">{error}</p> : null}
    {exportResult ? <p className="mx-auto mt-5 max-w-xl rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800" role="status">Downloaded {exportResult.filename} · {exportResult.width}×{exportResult.height}px · {(exportResult.bytes / 1_000_000).toFixed(1)} MB</p> : null}
    <div className="mx-auto mt-8 grid max-w-xl gap-3">
      <fieldset className="grid grid-cols-2 gap-2 rounded-2xl bg-white p-1.5 shadow-sm" disabled={exporting}><legend className="sr-only">Export format</legend>{(['png', 'jpg'] as const).map((value) => <button aria-pressed={format === value} className={`min-h-11 rounded-xl text-sm font-black uppercase transition-colors ${format === value ? 'bg-stone-950 text-white' : 'text-stone-500 hover:bg-stone-100'}`} key={value} onClick={() => setFormat(value)} type="button">{value}</button>)}</fieldset>
      <button aria-busy={exporting} className="relative min-h-14 overflow-hidden rounded-2xl border border-stone-300 bg-white px-5 font-bold shadow-sm disabled:cursor-wait disabled:text-stone-500" disabled={exporting || !slots.every(Boolean)} onClick={exportImage} type="button">{exporting ? `Exporting ${exportProgress}%` : `Export ${format.toUpperCase()}`}{exporting ? <span className="absolute inset-x-0 bottom-0 h-1 bg-stone-100"><span className="block h-full bg-[var(--brand-primary)] transition-[width] duration-200" style={{ width: `${exportProgress}%` }} /></span> : null}</button>
      <PrimaryButton disabled={submitting || exporting || !slots.some(Boolean)} onClick={submit}>{submitting ? 'Preparing order…' : 'Send Print Order'}</PrimaryButton>
      <button className="min-h-12 rounded-xl font-semibold text-stone-600 hover:bg-white disabled:opacity-50" disabled={exporting} onClick={onBack} type="button">Back to editor</button>
    </div>
  </PageShell>
}
