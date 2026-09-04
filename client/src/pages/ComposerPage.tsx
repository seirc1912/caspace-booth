import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import type { FilledSlot, ImageTransform, PhotoAsset, PrintTemplate } from '../types/selfBooth'
import type { DirectPhotoTarget } from '../features/photos/directPhotoTarget'
import { nextFrameIndex } from '../features/photos/frameNavigation'
import { EditorToolbar } from '../components/editor/EditorToolbar'
import { TemplateCanvas } from '../components/editor/TemplateCanvas'
import { PageShell } from '../components/layout/PageShell'
import { CropToolbar } from '../components/editor/CropToolbar'

interface ComposerPageProps {
  template: PrintTemplate
  slots: Array<FilledSlot | null>
  currentSlot: number | null
  onBack: () => void
  onSave: () => void
  onFillEmpty: (photos: PhotoAsset[]) => void
  onNext: () => void
  onShuffle: () => void
  onCurrentSlotChange: (index: number | null) => void
  onRemove: (index: number) => void
  onPickPhoto: (target: DirectPhotoTarget, file: File) => void
  onTransform: (index: number, transform: Partial<ImageTransform>) => void
  onFitChange: (index: number, fit: 'contain' | 'cover') => void
  uploadedPhotos: PhotoAsset[]
  photoError: string | null
  onClearPhotoError: () => void
  onPhotoError: (message: string) => void
  frameIndex?: number
  frameCount?: number
  completedFrameIds?: string[]
  canOrder?: boolean
  frameIds?: string[]
  onSelectFrame?: (index: number) => void
  onDownload?: () => void
  downloading?: boolean
  orderProgress?: string | null
  onPrevious?: () => void
}

interface CropSnapshot { index: number; transform: ImageTransform; fit: 'contain' | 'cover' }
const resetTransform: ImageTransform = { zoom: 1, rotation: 0, x: 0, y: 0, flipX: false, flipY: false }

export function ComposerPage({ template, slots, currentSlot, onBack, onSave, onFillEmpty, onNext, onShuffle, onCurrentSlotChange, onRemove, onPickPhoto, onTransform, onFitChange, uploadedPhotos, photoError, onClearPhotoError, onPhotoError, frameIndex = 0, frameCount = 1, completedFrameIds = [], canOrder, frameIds = [], onSelectFrame, onDownload, downloading, onPrevious, orderProgress }: ComposerPageProps) {
  const [crop, setCrop] = useState<CropSnapshot | null>(null)
  const bottomControls = useRef<HTMLDivElement>(null)
  const photoInput = useRef<HTMLInputElement>(null)
  const pendingPhotoTarget = useRef<DirectPhotoTarget | null>(null)
  useEffect(() => {
    const controls = bottomControls.current
    if (!controls) return
    const root = document.documentElement
    const updateHeight = () => root.style.setProperty('--mobile-editor-controls-height', `${controls.getBoundingClientRect().height}px`)
    updateHeight()
    const observer = new ResizeObserver(updateHeight)
    observer.observe(controls)
    return () => { observer.disconnect(); root.style.removeProperty('--mobile-editor-controls-height') }
  }, [])
  const selectFrame = (index: number) => {
    onCurrentSlotChange(index)
  }
  const skipFrame = () => {
    const nextIndex = nextFrameIndex(frameIndex, frameCount)
    if (nextIndex !== null) onSelectFrame?.(nextIndex)
  }
  const openPhotoPicker = (slotIndex: number) => {
    const input = photoInput.current
    if (!input) return
    pendingPhotoTarget.current = { templateId: template.id, slotIndex, slotCount: template.slots.length }
    input.value = ''
    input.click()
  }
  const choosePhoto = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0]
    const target = pendingPhotoTarget.current
    event.currentTarget.value = ''
    pendingPhotoTarget.current = null
    if (file && target) onPickPhoto(target, file)
  }
  const beginCrop = (index: number) => {
    const slot = slots[index]
    if (!slot) return
    onCurrentSlotChange(index)
    setCrop({ index, transform: { ...slot.transform }, fit: slot.fit ?? 'contain' })
  }
  const finishCrop = () => setCrop(null)
  const cancelCrop = () => {
    if (!crop) return
    onTransform(crop.index, crop.transform)
    onFitChange(crop.index, crop.fit)
    setCrop(null)
  }
  const resetCrop = () => {
    if (!crop) return
    onTransform(crop.index, resetTransform)
    onFitChange(crop.index, 'contain')
  }
  return <PageShell className="pb-[calc(var(--mobile-editor-controls-height,18rem)+1rem)] md:pb-24">
    <input accept="image/*" className="sr-only" onChange={choosePhoto} ref={photoInput} type="file" />
    <header className="mb-4 flex items-center justify-between"><button className="min-h-11 rounded-full bg-white px-4 text-sm font-semibold shadow-sm" onClick={onBack} type="button">Rooms</button><div className="text-center"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand-primary)]">Frame {frameIndex + 1} / {frameCount}</p><h1 className="font-bold">{template.name}</h1></div><span className="grid size-11 place-items-center rounded-full bg-white text-xs font-bold shadow-sm">{slots.filter(Boolean).length}/{slots.length}</span></header>
    <div className="mx-auto mb-5 max-w-4xl"><div aria-label={`Frame progress: ${frameIndex + 1} of ${frameCount}`} aria-valuemax={frameCount} aria-valuemin={1} aria-valuenow={frameIndex + 1} className="h-2 overflow-hidden rounded-full bg-stone-200" role="progressbar"><div className="h-full rounded-full bg-[var(--brand-primary)] transition-[width] duration-300" style={{ width: `${((frameIndex + 1) / Math.max(1, frameCount)) * 100}%` }} /></div>{onSelectFrame && frameIds.length > 1 ? <div className="mt-3 flex gap-2 overflow-x-auto pb-1" aria-label="Room frames">{frameIds.map((id, index) => { const complete = completedFrameIds.includes(id); const current = index === frameIndex; const status = current ? 'current' : complete ? 'completed' : 'incomplete'; return <button aria-current={current ? 'step' : undefined} aria-label={`Frame ${index + 1}, ${status}`} className={`min-h-10 shrink-0 rounded-full border px-4 text-sm font-bold transition ${current ? 'border-sky-500 bg-sky-50 text-sky-700' : complete ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-stone-200 bg-white text-stone-500'}`} key={id} onClick={() => onSelectFrame(index)} type="button">{complete ? '✓' : current ? '●' : '○'} Frame {index + 1}</button> })}</div> : null}</div>
    <div className="mx-auto grid w-full max-w-4xl items-start gap-5 md:grid-cols-[minmax(18rem,25rem)_1fr]">
      <TemplateCanvas activeSlot={currentSlot} cropSlot={crop?.index ?? null} onImageError={onPhotoError} onActiveSlotChange={selectFrame} onAdd={openPhotoPicker} onBeginCrop={beginCrop} onRemove={(index) => { onRemove(index); if (crop?.index === index) setCrop(null) }} onReset={(index) => { onTransform(index, resetTransform); onFitChange(index, 'contain') }} onReplace={openPhotoPicker} onTransform={onTransform} slots={slots} template={template} />
      <aside className="rounded-[1.75rem] bg-white p-5 shadow-sm"><p className="text-sm font-semibold text-[var(--brand-primary)]">{template.name}</p><h2 className="mt-1 text-xl font-bold tracking-tight">Tap a frame. Choose a photo.</h2><p className="mt-2 text-sm leading-6 text-stone-500">Tap Add Image to choose one photo directly for that slot. Use Replace to choose a different photo later.</p><div className="mt-4 rounded-2xl bg-sky-50 p-3 text-xs font-semibold text-sky-700">Your existing frames and edits stay in place while you choose from Photos.</div></aside>
    </div>
    <div className="fixed inset-x-0 bottom-0 z-20 bg-white md:contents" ref={bottomControls}>{crop ? <CropToolbar fit={slots[crop.index]?.fit ?? 'contain'} onCancel={cancelCrop} onDone={finishCrop} onFitChange={(fit) => onFitChange(crop.index, fit)} onPositionXChange={(x) => onTransform(crop.index, { x })} onPositionYChange={(y) => onTransform(crop.index, { y })} onReset={resetCrop} onZoomChange={(zoom) => onTransform(crop.index, { zoom })} positionX={slots[crop.index]?.transform.x ?? 0} positionY={slots[crop.index]?.transform.y ?? 0} zoom={slots[crop.index]?.transform.zoom ?? 1} /> : null}<EditorToolbar canContinue={slots.every(Boolean)} canOrder={canOrder} downloading={downloading} nextLabel="Order" onAutoFill={() => onFillEmpty(uploadedPhotos)} onDownload={onDownload} onNext={onNext} onPrevious={onPrevious} onSave={() => { onSave(); onCurrentSlotChange(null); setCrop(null) }} onShuffle={onShuffle} onSkip={skipFrame} previousDisabled={frameIndex === 0} progressLabel={orderProgress} saved={completedFrameIds.includes(template.id)} skipDisabled={frameIndex >= frameCount - 1} /></div>
    {photoError ? <div className="fixed inset-x-4 top-4 z-[70] mx-auto flex max-w-md items-center justify-between gap-3 rounded-2xl bg-rose-600 px-4 py-3 text-sm font-semibold text-white shadow-2xl" role="alert"><span>{photoError}</span><button className="min-h-10 shrink-0 rounded-xl bg-white/15 px-3 font-bold" onClick={onClearPhotoError} type="button">Dismiss</button></div> : null}
  </PageShell>
}
