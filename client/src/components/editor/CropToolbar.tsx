import { useEffect, useRef, useState } from 'react'
import type { PointerEvent, ReactNode } from 'react'
import { maximumUserPhotoZoom, minimumUserPhotoZoom } from '../../features/photos/photoFit'
import { adjustmentFromPointer, stepAdjustment } from '../../features/photos/manualAdjustments'
import { PressHoldButton } from './PressHoldButton'
import { Icon } from '../ui/Icon'

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
  ariaLabel: string
  id: string
  label: ReactNode
  min: number
  max: number
  value: number
  valueLabel: string
  onChange: (value: number) => void
  step: number
}

function SliderRow({ ariaLabel, id, label, min, max, value, valueLabel, onChange, step }: SliderRowProps) {
  const frame = useRef<number | null>(null)
  const track = useRef<HTMLDivElement>(null)
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
  const updateFromPointer = (clientX: number) => {
    const bounds = track.current?.getBoundingClientRect()
    if (bounds) schedule(adjustmentFromPointer(clientX, bounds.left, bounds.width, min, max))
  }
  const finishPointer = (event: PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    flush()
  }
  const valueRef = useRef(value)
  useEffect(() => { valueRef.current = value }, [value])
  const adjust = (delta: number) => {
    const current = valueRef.current
    const next = stepAdjustment(current, delta, min, max)
    if (next === current) return false
    valueRef.current = next
    onChangeRef.current(next)
    return true
  }
  useEffect(() => () => { if (frame.current !== null) { cancelAnimationFrame(frame.current); onChangeRef.current(pendingValue.current) } }, [])
  return <div className="flex min-h-11 min-w-0 flex-1 items-center gap-1">
    <label className="grid w-9 shrink-0 place-items-center text-[11px] font-bold text-white" htmlFor={id}>{label}</label>
    <PressHoldButton ariaLabel={`Giảm ${ariaLabel}`} disabled={value <= min} onStep={() => adjust(-step)}><Icon className="size-[18px]" name="minus" /></PressHoldButton>
    <div className="relative flex h-11 min-w-0 flex-1 touch-none select-none items-center" onPointerCancel={finishPointer} onPointerDown={(event) => { if (event.button !== 0) return; event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); updateFromPointer(event.clientX) }} onPointerMove={(event) => { if (!event.currentTarget.hasPointerCapture(event.pointerId)) return; event.preventDefault(); updateFromPointer(event.clientX) }} onPointerUp={(event) => { updateFromPointer(event.clientX); finishPointer(event) }} ref={track}>
      <input aria-label={ariaLabel} className="pointer-events-none h-11 min-w-0 w-full accent-[#FF2D55]" id={id} max={max} min={min} onChange={(event) => schedule(Number(event.currentTarget.value))} onInput={(event) => schedule(Number(event.currentTarget.value))} step={step} type="range" value={value} />
    </div>
    <PressHoldButton ariaLabel={`Tăng ${ariaLabel}`} disabled={value >= max} onStep={() => adjust(step)}><Icon className="size-[18px]" name="add" /></PressHoldButton>
    <output className="w-11 shrink-0 text-right font-mono text-[11px] font-bold tabular-nums text-white/90">{valueLabel}</output>
  </div>
}

const positionLabel = (value: number) => `${value > 0 ? '+' : ''}${Math.round(value * 100)}%`
type TransformControl = 'zoom' | 'x' | 'y'

const controlClass = (active: boolean) => `inline-flex min-h-11 min-w-0 items-center justify-center gap-1 rounded-xl px-1.5 text-xs font-bold tabular-nums text-white transition ${active ? 'bg-white/20 ring-1 ring-[#FF2D55]' : 'bg-white/5 hover:bg-white/10'}`

export function CropToolbar({ onCancel, onDone, positionX, positionY, zoom, onPositionXChange, onPositionYChange, onZoomChange }: CropToolbarProps) {
  const [activeControl, setActiveControl] = useState<TransformControl>('zoom')
  const slider = activeControl === 'zoom'
    ? <SliderRow ariaLabel="mức phóng" id="crop-zoom" label={<Icon className="size-[18px]" name="zoomIn" />} max={maximumUserPhotoZoom} min={minimumUserPhotoZoom} onChange={onZoomChange} step={0.01} value={zoom} valueLabel={`${Math.round(zoom * 100)}%`} />
    : activeControl === 'x'
      ? <SliderRow ariaLabel="vị trí trái phải" id="crop-position-x" label={<Icon className="size-[18px]" name="moveX" />} max={1} min={-1} onChange={onPositionXChange} step={0.01} value={positionX} valueLabel={positionLabel(positionX)} />
      : <SliderRow ariaLabel="vị trí lên xuống" id="crop-position-y" label={<Icon className="size-[18px]" name="moveY" />} max={1} min={-1} onChange={onPositionYChange} step={0.01} value={positionY} valueLabel={positionLabel(positionY)} />

  return <div aria-label="Cắt và căn ảnh" className="cs-lcd rounded-[20px] p-1.5" role="group">
    <div className="grid grid-cols-[1.35fr_1fr_1fr_2.75rem] gap-1">
      <button aria-label={`Phóng ${Math.round(zoom * 100)}%`} aria-pressed={activeControl === 'zoom'} className={controlClass(activeControl === 'zoom')} onClick={() => setActiveControl('zoom')} type="button"><Icon className="size-4" name="zoomIn" />{Math.round(zoom * 100)}%</button>
      <button aria-label={`Trái phải ${positionLabel(positionX)}`} aria-pressed={activeControl === 'x'} className={controlClass(activeControl === 'x')} onClick={() => setActiveControl('x')} type="button"><Icon className="size-4" name="moveX" />{positionLabel(positionX)}</button>
      <button aria-label={`Lên xuống ${positionLabel(positionY)}`} aria-pressed={activeControl === 'y'} className={controlClass(activeControl === 'y')} onClick={() => setActiveControl('y')} type="button"><Icon className="size-4" name="moveY" />{positionLabel(positionY)}</button>
      <button aria-label="Xong, giữ cách cắt này" className="cs-btn-chrome grid size-11 place-items-center rounded-xl" onClick={onDone} type="button"><Icon name="check" /></button>
    </div>
    <div className="mt-1 flex min-w-0 items-center gap-1 overflow-hidden rounded-xl bg-black/25 px-1">
      <button aria-label="Huỷ thay đổi cắt ảnh" className="grid size-11 shrink-0 place-items-center rounded-xl text-white/80 hover:bg-white/10" onClick={onCancel} type="button"><Icon name="close" /></button>
      {slider}
    </div>
  </div>
}
