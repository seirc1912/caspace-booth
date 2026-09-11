import { useEffect, useRef, useState } from 'react'
import { maximumUserPhotoZoom, minimumUserPhotoZoom } from '../../features/photos/photoFit'

interface CropToolbarProps {
  onCancel: () => void
  onDone: () => void
  positionX: number
  positionY: number
  zoom: number
  onPositionXChange: (position: number) => void
  onPositionYChange: (position: number) => void
  onZoomChange: (zoom: number) => void
}

interface SliderRowProps {
  ariaLabel?: string
  id: string
  label: string
  min: number
  max: number
  value: number
  valueLabel: string
  onChange: (value: number) => void
}

function SliderRow({ ariaLabel, id, label, min, max, value, valueLabel, onChange }: SliderRowProps) {
  const frame = useRef<number | null>(null)
  const pendingValue = useRef(value)
  const onChangeRef = useRef(onChange)
  useEffect(() => { onChangeRef.current = onChange }, [onChange])
  const flush = () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current)
    frame.current = null
    onChangeRef.current(pendingValue.current)
  }
  const schedule = (nextValue: number) => {
    pendingValue.current = nextValue
    if (frame.current === null) frame.current = requestAnimationFrame(flush)
  }
  useEffect(() => () => { if (frame.current !== null) { cancelAnimationFrame(frame.current); onChangeRef.current(pendingValue.current) } }, [])
  return <div className="flex min-h-11 min-w-0 flex-1 items-center gap-2"><label className="w-12 shrink-0 text-center text-xs font-bold text-white" htmlFor={id}>{label}</label><input aria-label={ariaLabel ?? label} className="h-10 min-w-0 flex-1 accent-sky-400" id={id} max={max} min={min} onChange={(event) => schedule(Number(event.currentTarget.value))} onInput={(event) => schedule(Number(event.currentTarget.value))} onPointerUp={flush} step="0.01" type="range" value={value} /><output className="w-11 shrink-0 text-right text-xs font-bold tabular-nums text-white/85">{valueLabel}</output></div>
}

const positionLabel = (value: number) => `${value > 0 ? '+' : ''}${Math.round(value * 100)}%`
type TransformControl = 'zoom' | 'x' | 'y'

const controlClass = (active: boolean) => `min-h-11 min-w-0 rounded-xl px-1.5 text-xs font-bold tabular-nums text-white transition ${active ? 'bg-sky-500 shadow-sm' : 'bg-white/5 hover:bg-white/10'}`

export function CropToolbar({ onCancel, onDone, positionX, positionY, zoom, onPositionXChange, onPositionYChange, onZoomChange }: CropToolbarProps) {
  const [activeControl, setActiveControl] = useState<TransformControl>('zoom')
  const slider = activeControl === 'zoom'
    ? <SliderRow id="crop-zoom" label="Zoom" max={maximumUserPhotoZoom} min={minimumUserPhotoZoom} onChange={onZoomChange} value={zoom} valueLabel={`${Math.round(zoom * 100)}%`} />
    : activeControl === 'x'
      ? <SliderRow ariaLabel="Move photo left or right" id="crop-position-x" label="↔" max={1} min={-1} onChange={onPositionXChange} value={positionX} valueLabel={positionLabel(positionX)} />
      : <SliderRow ariaLabel="Move photo up or down" id="crop-position-y" label="↕" max={1} min={-1} onChange={onPositionYChange} value={positionY} valueLabel={positionLabel(positionY)} />

  return <div className="fixed inset-x-2 z-30 bottom-[calc(var(--mobile-editor-controls-height,7rem)+0.5rem)] md:inset-x-3 md:bottom-20"><div className="mx-auto max-w-xl rounded-2xl border border-white/20 bg-stone-950/65 p-1.5 text-white shadow-2xl backdrop-blur-xl [-webkit-backdrop-filter:blur(18px)]">
    <div className="grid grid-cols-[1.35fr_1fr_1fr_2.75rem] gap-1">
      <button aria-pressed={activeControl === 'zoom'} className={controlClass(activeControl === 'zoom')} onClick={() => setActiveControl('zoom')} type="button">Zoom {Math.round(zoom * 100)}%</button>
      <button aria-label={`Left to right ${positionLabel(positionX)}`} aria-pressed={activeControl === 'x'} className={controlClass(activeControl === 'x')} onClick={() => setActiveControl('x')} type="button">↔ {positionLabel(positionX)}</button>
      <button aria-label={`Up and down ${positionLabel(positionY)}`} aria-pressed={activeControl === 'y'} className={controlClass(activeControl === 'y')} onClick={() => setActiveControl('y')} type="button">↕ {positionLabel(positionY)}</button>
      <button aria-label="Done adjusting photo" className="grid size-11 place-items-center rounded-xl bg-[var(--brand-secondary)] text-lg font-black text-white shadow-sm" onClick={onDone} type="button">✓</button>
    </div>
    <div className="mt-1 flex min-w-0 items-center gap-1 rounded-xl bg-black/15 px-1">
      <button aria-label="Cancel photo adjustments" className="grid size-11 shrink-0 place-items-center rounded-xl text-lg font-bold text-white/75 hover:bg-white/10" onClick={onCancel} type="button">×</button>
      {slider}
    </div>
  </div></div>
}
