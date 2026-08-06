import type { TemplateGuideSettings } from '../../../types/selfBooth'

interface GuideControlsProps {
  settings: TemplateGuideSettings
  onChange: (settings: TemplateGuideSettings) => void
}

export function GuideControls({ settings, onChange }: GuideControlsProps) {
  const toggle = (key: keyof TemplateGuideSettings) => onChange({ ...settings, [key]: !settings[key] })
  return <section className="rounded-2xl bg-white p-4 shadow-sm"><h2 className="text-sm font-bold">Canvas & guides</h2><div className="mt-3 grid gap-2">{([['snapToGrid', 'Snap to grid'], ['showSafeArea', 'Safe area'], ['showTrimLine', 'Trim line'], ['showBleedArea', 'Bleed area']] as const).map(([key, label]) => <label className="flex min-h-9 items-center gap-2 text-xs font-semibold" key={key}><input checked={settings[key] as boolean} onChange={() => toggle(key)} type="checkbox" />{label}</label>)}<label className="text-xs font-semibold">Grid size<input className="mt-1 min-h-10 w-full rounded-lg border border-stone-200 px-3" min="1" onChange={(event) => onChange({ ...settings, gridSize: Number(event.target.value) })} type="number" value={settings.gridSize} /></label></div></section>
}
