import { useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import type { FilledSlot, ImageTransform, PrintTemplate } from '../types/selfBooth'
import type { DirectPhotoTarget } from '../features/photos/directPhotoTarget'
import { createFramePhotoTarget, type FramePhotoTarget } from '../features/photos/framePhotoTarget'
import type { PhotoFilter } from '../features/photos/photoFilter'
import { createAutoFitZoomUpdate } from '../features/photos/autoFitZoom'
import { createInitialPhotoTransform } from '../features/photos/initialPhotoSlot'
import { EditorToolbar } from '../components/editor/EditorToolbar'
import { TemplateCanvas } from '../components/editor/TemplateCanvas'
import { PageShell } from '../components/layout/PageShell'
import { CropToolbar } from '../components/editor/CropToolbar'
import { BoothPoolSheet } from '../components/editor/BoothPoolSheet'
import { frameCode } from '../components/editor/frameCode'
import { FrameSwitcherSheet, type EditorFrame } from '../components/editor/FrameSwitcherSheet'
import { roundBackClass } from '../components/chrome/AppHeader'
import { BottomBar } from '../components/chrome/BottomBar'
import { Button, Spinner } from '../components/chrome/Button'
import { Stepper } from '../components/chrome/Stepper'
import { stepCounter } from '../components/chrome/flowSteps'
import { Icon } from '../components/ui/Icon'
import { loadBoothOriginals, MAX_BOOTH_SELECTION, type BoothPhoto } from '../features/boothPhotos/boothPhotosClient'

interface ComposerPageProps {
  template: PrintTemplate
  backgroundUrl?: string | null
  /** Print size of the current frame (e.g. "5x15"), shown on the stage HUD. */
  printSize?: string
  slots: Array<FilledSlot | null>
  currentSlot: number | null
  onBack: () => void
  onCurrentSlotChange: (index: number | null) => void
  onRemove: (index: number) => void
  onPickPhoto: (target: DirectPhotoTarget, file: File) => void
  onPickFramePhotos: (target: FramePhotoTarget, files: File[]) => void
  onAutoFillPhotos?: (files: File[]) => void
  autoFillPhotoCount?: number | null
  autoFillPreparing?: boolean
  autoFillHasExistingPhotos?: boolean
  onTransform: (index: number, transform: Partial<ImageTransform>) => void
  onFitChange: (index: number, fit: 'contain' | 'cover') => void
  onFilterChange: (index: number, filter: PhotoFilter) => void
  allBwEnabled?: boolean
  onToggleAllBw?: () => void
  photoError: string | null
  onClearPhotoError: () => void
  onPhotoError: (message: string) => void
  frameIndex?: number
  /** Every frame of the room ("Khung khác" sheet). */
  frames?: EditorFrame[]
  onSelectFrame?: (index: number) => void
  /** Save the current frame as a photo on the phone. */
  onDownload?: () => void
  downloading?: boolean
  saveConfirmation?: string | null
  /** Booth photos + the customer's own uploads (thumbnails); Tự xếp / Thêm ảnh use these first. */
  boothPhotos?: BoothPhoto[]
  loadBoothOriginal?: (photo: BoothPhoto) => Promise<File>
  /** Frames with every slot filled; > 0 enables "Gửi in". */
  sendableFrameCount?: number
  onOpenSendFrames?: () => void
}

type PoolRequest = { kind: 'slot'; target: DirectPhotoTarget } | { kind: 'frame'; target: FramePhotoTarget }

interface CropSnapshot { index: number; transform: ImageTransform; fit: 'contain' | 'cover'; filter: PhotoFilter }

const hudCorner = 'pointer-events-none absolute size-5 border-white/55'

export function ComposerPage({ template, backgroundUrl, printSize, slots, currentSlot, onBack, onCurrentSlotChange, onRemove, onPickPhoto, onPickFramePhotos, onAutoFillPhotos, autoFillPhotoCount = null, autoFillPreparing = false, autoFillHasExistingPhotos = false, onTransform, onFitChange, onFilterChange, allBwEnabled = false, onToggleAllBw, photoError, onClearPhotoError, onPhotoError, frameIndex = 0, frames = [], onSelectFrame, onDownload, downloading = false, saveConfirmation, boothPhotos = [], loadBoothOriginal, sendableFrameCount = 0, onOpenSendFrames }: ComposerPageProps) {
  const [crop, setCrop] = useState<CropSnapshot | null>(null)
  const photoInput = useRef<HTMLInputElement>(null)
  const framePhotoInput = useRef<HTMLInputElement>(null)
  const autoFillPhotoInput = useRef<HTMLInputElement>(null)
  const [autoFillDialogOpen, setAutoFillDialogOpen] = useState(false)
  const [poolRequest, setPoolRequest] = useState<PoolRequest | null>(null)
  const pendingPhotoTarget = useRef<DirectPhotoTarget | null>(null)
  const pendingFramePhotoTarget = useRef<FramePhotoTarget | null>(null)
  const [browseBooth, setBrowseBooth] = useState(false)
  const [framesOpen, setFramesOpen] = useState(false)
  const [poolProgress, setPoolProgress] = useState<{ done: number; total: number } | null>(null)
  /** Downloads only the originals actually used, with a progress chip; the editor stays usable. */
  const withBoothFiles = (photos: BoothPhoto[], use: (files: File[]) => void) => {
    if (!loadBoothOriginal || !photos.length) return
    setPoolProgress({ done: 0, total: photos.length })
    void loadBoothOriginals(photos, loadBoothOriginal, (done, total) => setPoolProgress({ done, total }))
      .then((files) => { if (files.length) use(files); else onPhotoError('Ảnh phòng chụp chưa tải được. Vui lòng kiểm tra mạng.') })
      .finally(() => setPoolProgress(null))
  }
  const selectSlot = (index: number) => {
    if (crop && crop.index !== index) setCrop(null)
    onCurrentSlotChange(index)
  }
  const openPhotoPicker = (slotIndex: number, fromPhone = false) => {
    const target = { templateId: template.id, slotIndex, slotCount: template.slots.length }
    if (boothPhotos.length && !fromPhone) {
      // Empty slot in a multi-photo frame: pick several booth photos in one go — the first
      // goes into the tapped slot, the rest fill the other empty slots in order.
      const frameTarget = createFramePhotoTarget(template.id, slots)
      if (!slots[slotIndex] && frameTarget.emptySlotIndices.length > 1) {
        setPoolRequest({ kind: 'frame', target: { ...frameTarget, emptySlotIndices: [slotIndex, ...frameTarget.emptySlotIndices.filter((index) => index !== slotIndex)] } })
        return
      }
      setPoolRequest({ kind: 'slot', target })
      return
    }
    const input = photoInput.current
    if (!input) return
    pendingPhotoTarget.current = target
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
  const openFramePhotoPicker = (fromPhone = false) => {
    const target = createFramePhotoTarget(template.id, slots)
    if (boothPhotos.length && !fromPhone) { setPoolRequest({ kind: 'frame', target }); return }
    const input = framePhotoInput.current
    if (!input) return
    pendingFramePhotoTarget.current = target
    input.value = ''
    input.click()
  }
  const chooseFramePhotos = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.currentTarget.files ?? [])
    const target = pendingFramePhotoTarget.current
    event.currentTarget.value = ''
    pendingFramePhotoTarget.current = null
    if (files.length && target) onPickFramePhotos(target, files)
  }
  const openAutoFillPicker = () => {
    // Tự xếp uses the first 20 booth photos (shooting order) — at most ~75 MB to download.
    if (boothPhotos.length) { setAutoFillDialogOpen(false); withBoothFiles(boothPhotos.slice(0, MAX_BOOTH_SELECTION), (files) => onAutoFillPhotos?.(files)); return }
    const input = autoFillPhotoInput.current
    if (!input) return
    setAutoFillDialogOpen(false)
    input.value = ''
    input.click()
  }
  const chooseAutoFillPhotos = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.currentTarget.files ?? [])
    event.currentTarget.value = ''
    if (files.length) onAutoFillPhotos?.(files)
  }
  const beginCrop = (index: number) => {
    const slot = slots[index]
    if (!slot) return
    onCurrentSlotChange(index)
    setCrop({ index, transform: { ...slot.transform }, fit: slot.fit ?? 'contain', filter: slot.filter ?? 'none' })
  }
  const finishCrop = () => setCrop(null)
  const cancelCrop = () => {
    if (!crop) return
    onTransform(crop.index, crop.transform)
    onFitChange(crop.index, crop.fit)
    onFilterChange(crop.index, crop.filter)
    setCrop(null)
  }
  const selectedSlot = currentSlot === null ? null : slots[currentSlot] ?? null
  const filledCount = slots.filter(Boolean).length
  const remainingSlotCount = slots.length - filledCount
  /** "Thêm ảnh": several photos fill the empty slots in order (single-slot frames: that slot). */
  const openAddImagePicker = () => {
    if (currentSlot !== null && !slots[currentSlot]) openPhotoPicker(currentSlot)
    else if (template.slots.length > 1) openFramePhotoPicker()
    else openPhotoPicker(currentSlot ?? 0)
  }
  const replaceSelected = () => {
    if (currentSlot !== null && selectedSlot) openPhotoPicker(currentSlot)
    else openAddImagePicker()
  }
  const toggleAutoFit = () => {
    if (currentSlot === null || !selectedSlot) return
    onTransform(currentSlot, createAutoFitZoomUpdate(selectedSlot.transform.zoom))
  }
  const toggleSlotBw = () => {
    if (currentSlot === null || !selectedSlot) return
    onFilterChange(currentSlot, selectedSlot.filter === 'grayscale' ? 'none' : 'grayscale')
  }
  const removeSelected = () => {
    if (currentSlot === null || !selectedSlot) return
    onRemove(currentSlot)
    if (crop?.index === currentSlot) setCrop(null)
  }
  const aspect = `${template.canvas.width} / ${template.canvas.height}`
  const stageLabel = [printSize && /^\s*\d+([.,]\d+)?\s*[x×]\s*\d+([.,]\d+)?\s*(cm|in)?\s*$/i.test(printSize) ? printSize.replace(/\s*[x×]\s*/i, '×') : null, `${template.slots.length} ô`].filter(Boolean).join(' · ')
  const frameName = frames.length ? frameCode(frameIndex) : template.name
  const canSend = Boolean(onOpenSendFrames) && sendableFrameCount > 0
  const canSave = slots.length > 0 && remainingSlotCount === 0

  return <PageShell bottomBar={<BottomBar><div className="grid grid-cols-[auto_minmax(0,1fr)] gap-2.5">
    <Button className="whitespace-nowrap" disabled={frames.length < 2 || !onSelectFrame} onClick={() => setFramesOpen(true)} variant="chrome">Khung khác</Button>
    <Button disabled={!canSend} onClick={onOpenSendFrames} trailingIcon={<Icon name="arrowRight" />}>{canSend ? `Gửi in · ${sendableFrameCount} khung` : `Còn ${remainingSlotCount} ô trống`}</Button>
  </div></BottomBar>} className="overflow-x-hidden" footer={false}>
    <input accept="image/*" aria-label="Chọn một ảnh từ điện thoại" className="sr-only" onChange={choosePhoto} ref={photoInput} type="file" />
    <input accept="image/*" aria-label="Chọn nhiều ảnh từ điện thoại" className="sr-only" multiple onChange={chooseFramePhotos} ref={framePhotoInput} type="file" />
    <input accept="image/*" aria-label="Chọn ảnh cho tất cả khung" className="sr-only" multiple onChange={chooseAutoFillPhotos} ref={autoFillPhotoInput} type="file" />
    <header className="grid grid-cols-[2.75rem_minmax(0,1fr)_auto] items-center gap-3">
      <button aria-label="Quay lại chọn phòng" className={roundBackClass} onClick={onBack} type="button"><Icon name="back" /></button>
      <div className="min-w-0"><h1 className="line-clamp-2 break-words text-lg font-black leading-tight tracking-[-0.02em]">Ghép khung · {frameName}</h1><p className="cs-mono mt-0.5 text-[11px] text-cs-ink-2">Đã ghép {filledCount}/{slots.length} ô</p></div>
      <span className="cs-mono text-xs text-cs-ink-2">{stepCounter(3)}</span>
    </header>
    <div className="mt-3"><Stepper compact step={3} /></div>

    <section aria-label="Khung in" className="cs-lcd relative mt-4 rounded-[28px] px-4 pb-3 pt-10">
      <span aria-hidden="true" className={`${hudCorner} left-3 top-3 border-l-2 border-t-2`} /><span aria-hidden="true" className={`${hudCorner} right-3 top-3 border-r-2 border-t-2`} /><span aria-hidden="true" className={`${hudCorner} bottom-3 left-3 border-b-2 border-l-2`} /><span aria-hidden="true" className={`${hudCorner} bottom-3 right-3 border-b-2 border-r-2`} />
      <p className="cs-mono absolute left-10 top-3.5 text-[11px] text-white/80">{stageLabel}</p>
      {allBwEnabled ? <p className="cs-mono absolute right-10 top-3.5 text-[11px] text-white/80">Đen trắng</p> : null}
      <div className="mx-auto" style={{ width: `min(100%, calc(min(54dvh, 420px) * ${template.canvas.width} / ${template.canvas.height}))`, aspectRatio: aspect }}>
        <TemplateCanvas activeSlot={currentSlot} backgroundUrl={backgroundUrl} cropSlot={crop?.index ?? null} onActiveSlotChange={selectSlot} onAdd={openPhotoPicker} onBeginCrop={beginCrop} onImageError={onPhotoError} onRemove={(index) => { onRemove(index); if (crop?.index === index) setCrop(null) }} onReset={(index) => { onTransform(index, createInitialPhotoTransform()); onFitChange(index, 'contain') }} onTransform={onTransform} slots={slots} template={template} />
      </div>
      <p className="mt-3 text-center text-[13px] leading-snug text-white/85">{crop ? 'Kéo để căn · chụm hai ngón để phóng · chạm đúp để đặt lại' : 'Chạm một ô để chỉnh · kéo để căn ảnh'}</p>
    </section>

    <div className="mt-3">
      {crop ? <CropToolbar onCancel={cancelCrop} onDone={finishCrop} onPositionXChange={(x) => onTransform(crop.index, { x })} onPositionYChange={(y) => onTransform(crop.index, { y })} onZoomChange={(zoom) => onTransform(crop.index, { zoom })} positionX={slots[crop.index]?.transform.x ?? 0} positionY={slots[crop.index]?.transform.y ?? 0} zoom={slots[crop.index]?.transform.zoom ?? 1} />
        : <EditorToolbar autoFillBusy={autoFillPreparing || Boolean(poolProgress)} autoFillDisabled={autoFillPreparing || !autoFillPhotoCount || !onAutoFillPhotos} bwActive={allBwEnabled || selectedSlot?.filter === 'grayscale'} bwDisabled={allBwEnabled || !selectedSlot} cropActive={false} disabled={downloading} hasPhoto={Boolean(selectedSlot)} onAutoFill={() => setAutoFillDialogOpen(true)} onCrop={() => { if (currentSlot !== null) beginCrop(currentSlot) }} onRemove={removeSelected} onReplace={replaceSelected} onToggleBw={toggleSlotBw} onZoom={toggleAutoFit} replaceDisabled={!selectedSlot && remainingSlotCount === 0} replaceMode={selectedSlot ? 'replace' : 'add'} />}
    </div>

    <div className="mt-2.5 grid auto-cols-fr grid-flow-col gap-2">
      {boothPhotos.length ? <button className="cs-btn-chrome cs-press flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-[16px] px-1.5 py-1.5 text-[12px] font-bold leading-tight" onClick={() => setBrowseBooth(true)} type="button"><Icon className="size-[18px] shrink-0" name="camera" /><span>Ảnh phòng chụp ({boothPhotos.length})</span></button> : null}
      <button aria-pressed={allBwEnabled} className={`cs-press flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-[16px] px-1.5 py-1.5 text-[12px] font-bold leading-tight disabled:opacity-40 ${allBwEnabled ? 'cs-btn-primary' : 'cs-btn-chrome'}`} disabled={!onToggleAllBw || downloading} onClick={onToggleAllBw} type="button"><Icon className="size-[18px] shrink-0" name="contrast" /><span>Đen trắng tất cả</span></button>
      {onDownload ? <button aria-busy={downloading || undefined} className="cs-btn-chrome cs-press flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-[16px] px-1.5 py-1.5 text-[12px] font-bold leading-tight disabled:opacity-40" disabled={!canSave || downloading} onClick={onDownload} type="button">{downloading ? <Spinner /> : <Icon className="size-[18px] shrink-0" name="download" />}<span>{downloading ? 'Đang lưu…' : 'Lưu về máy'}</span></button> : null}
    </div>

    {poolRequest ? <BoothPoolSheet mode="pick" capacity={poolRequest.kind === 'slot' ? 1 : Math.max(1, poolRequest.target.emptySlotIndices.length)} slotNumbers={template.slots.length > 1 ? (poolRequest.kind === 'slot' ? [poolRequest.target.slotIndex + 1] : poolRequest.target.emptySlotIndices.map((slot) => slot + 1)) : []} onClose={() => setPoolRequest(null)} onConfirm={(ids) => {
      const request = poolRequest
      setPoolRequest(null)
      const chosen = ids.map((id) => boothPhotos.find((photo) => photo.id === id)).filter((photo): photo is BoothPhoto => Boolean(photo))
      withBoothFiles(chosen, (files) => {
        if (request.kind === 'slot' && files[0]) onPickPhoto(request.target, files[0])
        if (request.kind === 'frame') onPickFramePhotos(request.target, files)
      })
    }} onUsePhone={() => {
      const request = poolRequest
      setPoolRequest(null)
      if (request.kind === 'slot') openPhotoPicker(request.target.slotIndex, true)
      else openFramePhotoPicker(true)
    }} photos={boothPhotos} /> : null}
    {browseBooth ? <BoothPoolSheet mode="browse" onClose={() => setBrowseBooth(false)} photos={boothPhotos} /> : null}
    {framesOpen && onSelectFrame ? <FrameSwitcherSheet currentIndex={frameIndex} frames={frames} onClose={() => setFramesOpen(false)} onSelect={(index) => { setFramesOpen(false); setCrop(null); if (index !== frameIndex) onSelectFrame(index) }} /> : null}
    {poolProgress ? <div className="cs-lcd pointer-events-none fixed inset-x-4 top-[max(16px,env(safe-area-inset-top))] z-[60] mx-auto flex max-w-xs items-center justify-center gap-2 rounded-full px-4 py-2.5 text-[13px] font-bold" role="status"><Spinner className="size-4" />{`Đang tải ảnh phòng chụp ${poolProgress.done}/${poolProgress.total}…`}</div> : null}
    {saveConfirmation ? <div className="fixed inset-x-4 top-[max(16px,env(safe-area-inset-top))] z-[70] mx-auto max-w-sm rounded-[16px] border border-cs-alert-success-border bg-cs-alert-success-bg px-4 py-3 text-center text-sm font-bold text-cs-alert-success-fg shadow-2xl" role="status">{saveConfirmation}</div> : null}
    {autoFillDialogOpen && autoFillPhotoCount ? <div aria-labelledby="auto-fill-title" aria-modal="true" className="fixed inset-0 z-[80] grid place-items-center bg-[rgba(13,14,16,.55)] p-4" role="dialog"><div className="cs-panel w-full max-w-sm rounded-[28px] p-5"><h2 className="text-xl font-black tracking-[-0.02em]" id="auto-fill-title">Tự xếp ảnh vào tất cả khung</h2><p className="mt-2 text-[15px] leading-normal text-cs-ink-2">{autoFillHasExistingPhotos ? 'Tự xếp sẽ thay các ảnh đang có trong các khung của phòng này. Tiếp tục?' : boothPhotos.length ? `Ảnh phòng chụp sẽ được xếp lần lượt vào các khung của phòng (tối đa ${MAX_BOOTH_SELECTION} ảnh).` : `Chọn bao nhiêu ảnh cũng được, ảnh sẽ được chia vào các khung. Chọn ${autoFillPhotoCount} ảnh để lấp đầy cả phòng.`}</p><div className="mt-5 grid grid-cols-2 gap-2.5"><Button onClick={() => setAutoFillDialogOpen(false)} variant="chrome">Huỷ</Button><Button onClick={openAutoFillPicker}>Tiếp tục</Button></div></div></div> : null}
    {photoError ? <div className="fixed inset-x-4 top-[max(16px,env(safe-area-inset-top))] z-[70] mx-auto flex max-w-md items-center justify-between gap-3 rounded-[16px] border border-cs-alert-error-border bg-cs-alert-error-bg py-2 pl-4 pr-2 text-sm font-semibold text-cs-alert-error-fg shadow-2xl" role="alert"><span>{photoError}</span><button className="min-h-11 shrink-0 rounded-xl px-3 font-bold underline" onClick={onClearPhotoError} type="button">Đóng</button></div> : null}
  </PageShell>
}
