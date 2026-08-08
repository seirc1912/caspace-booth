import { useEffect, useMemo, useRef, useState } from 'react'
import type { FilledSlot, ImageTransform, PhotoAsset, PrintTemplate } from '../types/selfBooth'
import { EditorToolbar } from '../components/editor/EditorToolbar'
import { TemplateCanvas } from '../components/editor/TemplateCanvas'
import { PageShell } from '../components/layout/PageShell'
import { PhotoLibraryDock } from '../components/photo/PhotoLibraryDock'
import { CropToolbar } from '../components/editor/CropToolbar'

interface ComposerPageProps {
  template: PrintTemplate
  slots: Array<FilledSlot | null>
  currentSlot: number | null
  selectedPhotoIds: string[]
  onBack: () => void
  onClear: () => void
  onSave: () => void
  onFillEmpty: (photos: PhotoAsset[]) => void
  onNext: () => void
  onRandomFill: () => void
  onShuffle: () => void
  onCurrentSlotChange: (index: number | null) => void
  onClearSelectedPhotos: () => void
  onRemove: (index: number) => void
  onReplace: (index: number, photo: PhotoAsset) => void
  onTransform: (index: number, transform: Partial<ImageTransform>) => void
  onFitChange: (index: number, fit: 'contain' | 'cover') => void
  onToggleSelectedPhoto: (id: string) => void
  uploadedPhotos: PhotoAsset[]
  onAddPhotos: (files: File[]) => void
  onAddPhotoAssets: (photos: PhotoAsset[]) => void
  onDeletePhoto: (photoId: string) => void
  onMovePhoto: (photoId: string, direction: -1 | 1) => void
  onReplacePhoto: (photoId: string, file: File) => void
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
  onPrevious?: () => void
}

interface CropSnapshot { index: number; transform: ImageTransform; fit: 'contain' | 'cover' }
const resetTransform: ImageTransform = { zoom: 1, rotation: 0, x: 0, y: 0, flipX: false, flipY: false }

export function ComposerPage({ template, slots, currentSlot, onBack, onClear, onSave, onFillEmpty, onNext, onShuffle, onCurrentSlotChange, onRemove, onReplace, onTransform, onFitChange, uploadedPhotos, onAddPhotos, onDeletePhoto, onReplacePhoto, photoError, onClearPhotoError, onPhotoError, frameIndex = 0, frameCount = 1, completedFrameIds = [], canOrder, frameIds = [], onSelectFrame, onDownload, downloading, onPrevious }: ComposerPageProps) {
  const [crop, setCrop] = useState<CropSnapshot | null>(null)
  const [activePhotoId, setActivePhotoId] = useState<string | null>(null)
  const bottomControls = useRef<HTMLDivElement>(null)
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
  const usage = useMemo(() => slots.reduce<Record<string, number>>((counts, slot) => {
    if (slot) counts[slot.photo.id] = (counts[slot.photo.id] ?? 0) + 1
    return counts
  }, {}), [slots])

  const assign = (photo: PhotoAsset, target: number) => {
    if (target < 0 || target >= slots.length) return
    onReplace(target, photo)
    onCurrentSlotChange(target)
  }
  const selectFrame = (index: number) => {
    const activePhoto = uploadedPhotos.find((photo) => photo.id === activePhotoId)
    if (activePhoto) assign(activePhoto, index)
    else onCurrentSlotChange(index)
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
  const dropPhoto = (index: number, photoId: string) => {
    const photo = uploadedPhotos.find((item) => item.id === photoId)
    if (photo) assign(photo, index)
  }
  const deletePhoto = (photoId: string) => {
    if (activePhotoId === photoId) setActivePhotoId(null)
    onDeletePhoto(photoId)
  }

  return <PageShell className="pb-[calc(var(--mobile-editor-controls-height,18rem)+1rem)] md:pb-24">
    <header className="mb-4 flex items-center justify-between"><button className="min-h-11 rounded-full bg-white px-4 text-sm font-semibold shadow-sm" onClick={onBack} type="button">Rooms</button><div className="text-center"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand-primary)]">Frame {frameIndex + 1} / {frameCount}</p><h1 className="font-bold">{template.name}</h1></div><span className="grid size-11 place-items-center rounded-full bg-white text-xs font-bold shadow-sm">{slots.filter(Boolean).length}/{slots.length}</span></header>
    <div className="mx-auto mb-5 max-w-4xl"><div aria-label={`Frame progress: ${frameIndex + 1} of ${frameCount}`} aria-valuemax={frameCount} aria-valuemin={1} aria-valuenow={frameIndex + 1} className="h-2 overflow-hidden rounded-full bg-stone-200" role="progressbar"><div className="h-full rounded-full bg-[var(--brand-primary)] transition-[width] duration-300" style={{ width: `${((frameIndex + 1) / Math.max(1, frameCount)) * 100}%` }} /></div>{onSelectFrame && frameIds.length > 1 ? <div className="mt-3 flex gap-2 overflow-x-auto pb-1" aria-label="Room frames">{frameIds.map((id, index) => { const complete = completedFrameIds.includes(id); const current = index === frameIndex; const status = current ? 'current' : complete ? 'completed' : 'incomplete'; return <button aria-current={current ? 'step' : undefined} aria-label={`Frame ${index + 1}, ${status}`} className={`min-h-10 shrink-0 rounded-full border px-4 text-sm font-bold transition ${current ? 'border-sky-500 bg-sky-50 text-sky-700' : complete ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-stone-200 bg-white text-stone-500'}`} key={id} onClick={() => onSelectFrame(index)} type="button">{complete ? '✓' : current ? '●' : '○'} Frame {index + 1}</button> })}</div> : null}</div>
    <div className="mx-auto grid w-full max-w-4xl items-start gap-5 md:grid-cols-[minmax(18rem,25rem)_1fr]">
      <TemplateCanvas activeSlot={currentSlot} cropSlot={crop?.index ?? null} onImageError={onPhotoError} onActiveSlotChange={selectFrame} onAdd={selectFrame} onBeginCrop={beginCrop} onDropPhoto={dropPhoto} onRemove={(index) => { onRemove(index); if (crop?.index === index) setCrop(null) }} onReset={(index) => { onTransform(index, resetTransform); onFitChange(index, 'contain') }} onReplace={(index) => onCurrentSlotChange(index)} onTransform={onTransform} slots={slots} template={template} />
      <aside className="rounded-[1.75rem] bg-white p-5 shadow-sm"><p className="text-sm font-semibold text-[var(--brand-primary)]">{template.name}</p><h2 className="mt-1 text-xl font-bold tracking-tight">Upload once. Create freely.</h2><p className="mt-2 text-sm leading-6 text-stone-500">Select a library photo, then tap any frame. Reuse any photo as many times as you like. Cropping only starts when you choose Crop.</p><div className="mt-4 rounded-2xl bg-sky-50 p-3 text-xs font-semibold text-sky-700">Desktop: drag thumbnails into frames. Mobile: tap photo, then tap frame.</div></aside>
    </div>
    <div className="fixed inset-x-0 bottom-0 z-20 bg-white md:contents" ref={bottomControls}><div className="mx-auto w-full max-w-4xl md:mt-5"><PhotoLibraryDock activePhotoId={activePhotoId} onImageError={onPhotoError} onAdd={onAddPhotos} onSelect={(photo) => setActivePhotoId(photo.id)} onDelete={deletePhoto} onReplace={onReplacePhoto} photos={uploadedPhotos} usage={usage} /></div><EditorToolbar canContinue={slots.every(Boolean)} canOrder={canOrder} downloading={downloading} nextLabel="Order" onAutoFill={() => onFillEmpty(uploadedPhotos)} onClear={() => { onClear(); onCurrentSlotChange(null); setCrop(null) }} onDownload={onDownload} onNext={onNext} onPrevious={onPrevious} onSave={() => { onSave(); onCurrentSlotChange(null); setCrop(null) }} onShuffle={onShuffle} previousDisabled={frameIndex === 0} saved={completedFrameIds.includes(template.id)} /></div>
    {crop ? <CropToolbar fit={slots[crop.index]?.fit ?? 'contain'} onCancel={cancelCrop} onDone={finishCrop} onFitChange={(fit) => onFitChange(crop.index, fit)} onReset={resetCrop} onZoomChange={(zoom) => onTransform(crop.index, { zoom })} zoom={slots[crop.index]?.transform.zoom ?? 1} /> : null}
    {photoError ? <div className="fixed inset-x-4 top-4 z-[70] mx-auto flex max-w-md items-center justify-between gap-3 rounded-2xl bg-rose-600 px-4 py-3 text-sm font-semibold text-white shadow-2xl" role="alert"><span>{photoError}</span><button className="min-h-10 shrink-0 rounded-xl bg-white/15 px-3 font-bold" onClick={onClearPhotoError} type="button">Dismiss</button></div> : null}
  </PageShell>
}
