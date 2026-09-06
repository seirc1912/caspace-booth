import { useEffect, useRef } from 'react'
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
  id: string
  label: string
  min: number
  max: number
  value: number
  valueLabel: string
  onChange: (value: number) => void
}

function SliderRow({ id, label, min, max, value, valueLabel, onChange }: SliderRowProps) {
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
  return <div className="flex min-h-11 items-center gap-2 px-2"><label className="w-24 shrink-0 text-xs font-bold text-stone-700" htmlFor={id}>{label}</label><input aria-label={label} className="h-9 min-w-0 flex-1 accent-sky-500" id={id} max={max} min={min} onChange={(event) => schedule(Number(event.currentTarget.value))} onInput={(event) => schedule(Number(event.currentTarget.value))} onPointerUp={flush} step="0.01" type="range" value={value} /><output className="w-12 text-right text-xs font-bold tabular-nums text-stone-600">{valueLabel}</output></div>
}

const positionLabel = (value: number) => `${value > 0 ? '+' : ''}${Math.round(value * 100)}%`

export function CropToolbar({ onCancel, onDone, positionX, positionY, zoom, onPositionXChange, onPositionYChange, onZoomChange }: CropToolbarProps) {
  return <div className="bg-white px-3 pt-1 md:fixed md:inset-x-0 md:bottom-20 md:z-30 md:bg-transparent md:px-3 md:pt-0"><div className="mx-auto grid max-w-xl gap-1"><div className="grid gap-0.5 rounded-2xl bg-white p-1 shadow-xl md:bg-white/95 md:backdrop-blur-xl"><SliderRow id="crop-zoom" label="Zoom" max={maximumUserPhotoZoom} min={minimumUserPhotoZoom} onChange={onZoomChange} value={zoom} valueLabel={`${Math.round(zoom * 100)}%`} /><SliderRow id="crop-position-x" label="Left ↔ Right" max={1} min={-1} onChange={onPositionXChange} value={positionX} valueLabel={positionLabel(positionX)} /><SliderRow id="crop-position-y" label="Up ↕ Down" max={1} min={-1} onChange={onPositionYChange} value={positionY} valueLabel={positionLabel(positionY)} /></div><div className="flex items-center justify-end gap-0.5 rounded-[28px] bg-white p-1 shadow-xl md:bg-white/95 md:backdrop-blur-xl"><button className="min-h-11 rounded-full px-3 text-xs font-bold text-stone-500" onClick={onCancel} type="button">Cancel</button><button className="min-h-11 rounded-full bg-[var(--brand-secondary)] px-4 text-xs font-black text-white shadow-sm" onClick={onDone} type="button">Done</button></div></div></div>
}
