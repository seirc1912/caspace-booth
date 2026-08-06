import { useMemo, useState } from 'react'
import { PrintPreview } from '../components/export/PrintPreview'
import { PageShell } from '../components/layout/PageShell'
import { StepHeader } from '../components/layout/StepHeader'
import { PrimaryButton } from '../components/ui/PrimaryButton'
import { useBranding } from '../contexts/BrandingContext'
import { useCustomerSession } from '../contexts/SessionContext'
import { printSizes } from '../data/printSizes'
import { ExportService } from '../services/export/ExportService'
import type { ExportResult, PrintSettings } from '../types/export'
import type { FilledSlot, PrintTemplate } from '../types/selfBooth'

interface ExportPreviewPageProps {
  template: PrintTemplate
  slots: Array<FilledSlot | null>
  onBack: () => void
}

const initialSettings: PrintSettings = {
  format: 'png', sizeId: '4x6', customWidth: 4, customHeight: 6,
  bleedInches: 0.125, quality: 95, colorProfile: 'srgb', filename: 'caspace-print',
}

export function ExportPreviewPage({ template, slots, onBack }: ExportPreviewPageProps) {
  const branding = useBranding()
  const session = useCustomerSession()
  const exportService = useMemo(() => new ExportService(), [])
  const [settings, setSettings] = useState(initialSettings)
  const [exporting, setExporting] = useState(false)
  const [result, setResult] = useState<ExportResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const update = <Key extends keyof PrintSettings>(key: Key, value: PrintSettings[Key]) => setSettings((current) => ({ ...current, [key]: value }))

  const handleExport = async () => {
    setExporting(true)
    setError(null)
    setResult(null)
    try {
      setResult(await exportService.create({ branding, session, settings, slots, template }))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Export failed')
    } finally {
      setExporting(false)
    }
  }

  return (
    <PageShell>
      <StepHeader description="Review print boundaries and create a 300 DPI production file from the original photos." eyebrow="Print preview" title="Prepare your print" />
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(20rem,1fr)_24rem]">
        <PrintPreview slots={slots} template={template} />
        <section aria-label="Print settings" className="rounded-[1.75rem] bg-white p-5 shadow-sm sm:p-6">
          <h2 className="text-xl font-bold">Print settings</h2>
          <div className="mt-5 grid gap-4">
            <label className="grid gap-1.5 text-sm font-semibold">Print size
              <select className="min-h-12 rounded-xl border border-stone-200 bg-white px-3 font-normal" onChange={(event) => update('sizeId', event.target.value as PrintSettings['sizeId'])} value={settings.sizeId}>
                {printSizes.map((size) => <option key={size.id} value={size.id}>{size.label}</option>)}
              </select>
            </label>
            {settings.sizeId === 'custom' ? <div className="grid grid-cols-2 gap-3"><label className="grid gap-1.5 text-sm font-semibold">Width (in)<input className="min-h-12 rounded-xl border border-stone-200 px-3 font-normal" max="24" min="1" onChange={(event) => update('customWidth', Number(event.target.value))} step="0.1" type="number" value={settings.customWidth} /></label><label className="grid gap-1.5 text-sm font-semibold">Height (in)<input className="min-h-12 rounded-xl border border-stone-200 px-3 font-normal" max="24" min="1" onChange={(event) => update('customHeight', Number(event.target.value))} step="0.1" type="number" value={settings.customHeight} /></label></div> : null}
            <fieldset><legend className="text-sm font-semibold">Format</legend><div className="mt-2 grid grid-cols-3 gap-2">{(['png', 'jpg', 'pdf'] as const).map((format) => <button aria-pressed={settings.format === format} className={`min-h-11 rounded-xl border text-sm font-bold uppercase ${settings.format === format ? 'border-stone-950 bg-stone-950 text-white' : 'border-stone-200'}`} key={format} onClick={() => update('format', format)} type="button">{format}</button>)}</div></fieldset>
            <label className="grid gap-1.5 text-sm font-semibold">Color profile<select className="min-h-12 rounded-xl border border-stone-200 bg-white px-3 font-normal" value="srgb"><option value="srgb">sRGB IEC61966-2.1</option><option disabled>CMYK — coming soon</option></select></label>
            <label className="grid gap-1.5 text-sm font-semibold">Filename<input className="min-h-12 rounded-xl border border-stone-200 px-3 font-normal" maxLength={80} onChange={(event) => update('filename', event.target.value)} value={settings.filename} /></label>
            <label className="grid gap-1.5 text-sm font-semibold">Quality <span className="font-normal text-stone-500">{settings.format === 'png' ? 'Lossless' : `${settings.quality}%`}</span><input disabled={settings.format === 'png'} max="100" min="70" onChange={(event) => update('quality', Number(event.target.value))} type="range" value={settings.quality} /></label>
            <div className="rounded-xl bg-stone-100 p-3 text-sm text-stone-600"><strong className="text-stone-900">300 DPI</strong> · {settings.bleedInches}&quot; bleed · Original image sources</div>
          </div>
          {error ? <p className="mt-4 rounded-xl bg-rose-50 p-3 text-sm font-medium text-rose-700" role="alert">{error}</p> : null}
          {result ? <p className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm font-medium text-emerald-800" role="status">Saved to {result.relativePath}</p> : null}
          <PrimaryButton className="mt-5 w-full" disabled={exporting || !slots.every(Boolean)} onClick={handleExport}>{exporting ? 'Creating print file…' : `Export ${settings.format.toUpperCase()}`}</PrimaryButton>
          <button className="mt-2 min-h-12 w-full rounded-xl font-semibold text-stone-600 hover:bg-stone-50" onClick={onBack} type="button">Back to editor</button>
        </section>
      </div>
    </PageShell>
  )
}
