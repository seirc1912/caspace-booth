import { layoutPresets } from '../model/layoutPresets'
import type { LayoutPresetId } from '../model/layoutPresets'

export function PresetLayoutPicker({ onApply }: { onApply: (presetId: LayoutPresetId) => void }) {
  return <section className="rounded-2xl bg-white p-4 shadow-sm"><h2 className="text-sm font-bold">Preset layouts</h2><p className="mt-1 text-xs text-stone-500">Apply a starting point, then customize every layer.</p><div className="mt-3 grid grid-cols-2 gap-2">{layoutPresets.map((preset) => <button className="min-h-10 rounded-lg border border-stone-200 px-2 text-xs font-semibold hover:border-violet-300 hover:bg-violet-50" key={preset.id} onClick={() => onApply(preset.id)} type="button">{preset.name}</button>)}</div></section>
}
