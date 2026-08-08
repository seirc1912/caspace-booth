interface CropToolbarProps {
  fit: 'contain' | 'cover'
  onCancel: () => void
  onDone: () => void
  onFitChange: (fit: 'contain' | 'cover') => void
  onReset: () => void
  positionX: number
  positionY: number
  zoom: number
  onPositionXChange: (position: number) => void
  onPositionYChange: (position: number) => void
  onZoomChange: (zoom: number) => void
}

interface SliderRowProps {
  id: string
  label: string
  min: number
  max: number
  value: number
  valueLabel: string
  onChange: (value: number) => void
}

function SliderRow({ id, label, min, max, value, valueLabel, onChange }: SliderRowProps) {
  return <div className="flex items-center gap-2 rounded-xl bg-white px-3 py-0.5 shadow-lg md:bg-white/95 md:backdrop-blur-xl"><label className="w-24 shrink-0 text-[11px] font-black text-stone-700" htmlFor={id}>{label}</label><input aria-label={label} className="h-10 min-w-0 flex-1 accent-sky-500" id={id} max={max} min={min} onInput={(event) => onChange(Number(event.currentTarget.value))} step="0.01" type="range" value={value} /><output className="w-12 text-right text-xs font-bold tabular-nums text-stone-600">{valueLabel}</output></div>
}

const positionLabel = (value: number) => `${value > 0 ? '+' : ''}${Math.round(value * 100)}%`

export function CropToolbar({ fit, onCancel, onDone, onFitChange, onReset, positionX, positionY, zoom, onPositionXChange, onPositionYChange, onZoomChange }: CropToolbarProps) {
  const chip = (active: boolean) => `min-h-11 rounded-full px-4 text-xs font-bold transition ${active ? 'bg-white text-stone-950 shadow-sm' : 'text-white hover:bg-white/10'}`
  return <div className="fixed inset-x-0 bottom-[calc(var(--mobile-editor-controls-height,18rem)+0.75rem)] z-30 px-3 md:bottom-5"><div className="mx-auto grid max-w-xl gap-1.5"><SliderRow id="crop-zoom" label="Zoom" max={6} min={0.25} onChange={onZoomChange} value={zoom} valueLabel={`${Math.round(zoom * 100)}%`} /><SliderRow id="crop-position-x" label="Left ↔ Right" max={1} min={-1} onChange={onPositionXChange} value={positionX} valueLabel={positionLabel(positionX)} /><SliderRow id="crop-position-y" label="Up ↕ Down" max={1} min={-1} onChange={onPositionYChange} value={positionY} valueLabel={positionLabel(positionY)} /><div className="flex items-center justify-between gap-2"><div className="flex items-center gap-1 rounded-[28px] bg-stone-950 p-1.5 shadow-xl md:bg-stone-950/88 md:backdrop-blur-xl" role="group" aria-label="Crop fit"><button aria-pressed={fit === 'contain'} className={chip(fit === 'contain')} onClick={() => onFitChange('contain')} type="button">Contain</button><button aria-pressed={fit === 'cover'} className={chip(fit === 'cover')} onClick={() => onFitChange('cover')} type="button">Cover</button><button className={chip(false)} onClick={onReset} type="button">Reset</button></div><div className="flex items-center gap-1 rounded-[28px] bg-white p-1.5 shadow-xl md:bg-white/95 md:backdrop-blur-xl"><button className="min-h-11 rounded-full px-3 text-xs font-bold text-stone-500" onClick={onCancel} type="button">Cancel</button><button className="min-h-11 rounded-full bg-[var(--brand-secondary)] px-5 text-xs font-black text-white shadow-sm" onClick={onDone} type="button">Done</button></div></div></div></div>
}
