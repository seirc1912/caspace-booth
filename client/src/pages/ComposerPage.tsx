import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ChangeEvent, PointerEvent as ReactPointerEvent } from 'react'
import type { FilledSlot, PrintTemplate, SlotTransform } from '../types/selfBooth'
import type { DirectPhotoTarget } from '../features/photos/directPhotoTarget'
import { createFramePhotoTarget, type FramePhotoTarget } from '../features/photos/framePhotoTarget'
import { photoFocus } from '../features/photos/faceFocus'
import { focusTransform, templateDpi } from '../features/photos/slotTransform'
import { TemplateCanvas } from '../components/editor/TemplateCanvas'
import { SlotEditor } from '../components/editor/SlotEditor'
import { FrameViewer } from '../components/editor/FrameViewer'
import { PageShell } from '../components/layout/PageShell'
import { BoothPoolSheet } from '../components/editor/BoothPoolSheet'
import { frameCode } from '../components/editor/frameCode'
import { FrameSwitcherSheet, type EditorFrame } from '../components/editor/FrameSwitcherSheet'
import { roundBackClass } from '../components/chrome/AppHeader'
import { BottomBar } from '../components/chrome/BottomBar'
import { BottomSheet } from '../components/chrome/BottomSheet'
import { Button, Spinner } from '../components/chrome/Button'
import { Stepper } from '../components/chrome/Stepper'
import { stepCounter } from '../components/chrome/flowSteps'
import { Icon, type IconName } from '../components/ui/Icon'
import { loadBoothOriginals, MAX_BOOTH_SELECTION, type BoothPhoto } from '../features/boothPhotos/boothPhotosClient'

interface ComposerPageProps {
  template: PrintTemplate
  backgroundUrl?: string | null
  /** Print size of the current frame (e.g. "5x15"): options sheet label and print-quality warning. */
  printSize?: string
  slots: Array<FilledSlot | null>
  onBack: () => void
  onCurrentSlotChange: (index: number | null) => void
  onRemove: (index: number) => void
  /** Drag a filled slot onto another slot: the photos trade places. */
  onSwapSlots?: (from: number, to: number) => void
  onPickPhoto: (target: DirectPhotoTarget, file: File) => void
  onPickFramePhotos: (target: FramePhotoTarget, files: File[]) => void
  /** "Tự xếp tất cả khung" (options sheet): spreads photos over every frame of the room. */
  onAutoFillPhotos?: (files: File[]) => void
  autoFillPhotoCount?: number | null
  autoFillPreparing?: boolean
  autoFillHasExistingPhotos?: boolean
  onTransform: (index: number, transform: Partial<SlotTransform>) => void
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
  /** Booth photos + the customer's own uploads (thumbnails): the photo tray. */
  boothPhotos?: BoothPhoto[]
  loadBoothOriginal?: (photo: BoothPhoto) => Promise<File>
  onOpenSendFrames?: () => void
}

type DragItem = { kind: 'tray'; photo: BoothPhoto } | { kind: 'slot'; index: number }
interface PendingDrag { item: DragItem; pointerId: number; pointerType: string; startX: number; startY: number; timer: number | null; active: boolean; target: number | null; image: string | null }
const LONG_PRESS_MS = 350

type PoolRequest = { kind: 'slot'; target: DirectPhotoTarget } | { kind: 'frame'; target: FramePhotoTarget }

function OptionButton({ label, icon, onClick, disabled, pressed, detail }: { label: string; icon: IconName; onClick: () => void; disabled?: boolean; pressed?: boolean; detail?: string }) {
  return <button aria-pressed={pressed} className={`cs-press flex min-h-14 w-full items-center gap-3 rounded-[16px] px-4 text-left text-[15px] font-bold disabled:opacity-40 ${pressed ? 'cs-btn-primary' : 'cs-btn-chrome'}`} disabled={disabled} onClick={onClick} type="button"><Icon className="size-5 shrink-0" name={icon} /><span className="min-w-0 flex-1">{label}{detail ? <span className="block text-[12px] font-medium opacity-75">{detail}</span> : null}</span></button>
}

/** Empty slots in reading order (top to bottom, left to right). */
const emptySlotsInOrder = (template: PrintTemplate, slots: Array<FilledSlot | null>) => template.slots.map((slot, index) => ({ index, x: slot.x, y: slot.y })).filter(({ index }) => !slots[index]).sort((a, b) => a.y - b.y || a.x - b.x).map(({ index }) => index)

/**
 * Bước "Ghép khung" (NC-01, chế độ Bố cục): the frame as large as the screen allows. No drag or
 * zoom here — tapping a filled slot opens Chỉnh ô (SlotEditor), an empty slot takes the next
 * unused tray photo. ⤢ shows the whole frame full screen.
 */
export function ComposerPage({ template, backgroundUrl, printSize, slots, onBack, onCurrentSlotChange, onRemove, onSwapSlots, onPickPhoto, onPickFramePhotos, onAutoFillPhotos, autoFillPhotoCount = null, autoFillPreparing = false, autoFillHasExistingPhotos = false, onTransform, allBwEnabled = false, onToggleAllBw, photoError, onClearPhotoError, onPhotoError, frameIndex = 0, frames = [], onSelectFrame, onDownload, downloading = false, saveConfirmation, boothPhotos = [], loadBoothOriginal, onOpenSendFrames }: ComposerPageProps) {
  const photoInput = useRef<HTMLInputElement>(null)
  const framePhotoInput = useRef<HTMLInputElement>(null)
  const autoFillPhotoInput = useRef<HTMLInputElement>(null)
  const pendingPhotoTarget = useRef<DirectPhotoTarget | null>(null)
  const pendingFramePhotoTarget = useRef<FramePhotoTarget | null>(null)
  const stage = useRef<HTMLDivElement>(null)
  const [stageSize, setStageSize] = useState<{ width: number; height: number } | null>(null)
  const [editIndex, setEditIndex] = useState<number | null>(null)
  const [viewerOpen, setViewerOpen] = useState(false)
  const [optionsOpen, setOptionsOpen] = useState(false)
  const [autoFillDialogOpen, setAutoFillDialogOpen] = useState(false)
  const [poolRequest, setPoolRequest] = useState<PoolRequest | null>(null)
  const [browseBooth, setBrowseBooth] = useState(false)
  const [framesOpen, setFramesOpen] = useState(false)
  const [poolProgress, setPoolProgress] = useState<{ done: number; total: number } | null>(null)
  /** Slot → its photo before the request: centre on the face once a different photo arrives (Tự xếp, tray, + Thêm ảnh, Thay ảnh). */
  const pendingFocus = useRef(new Map<number, string | null>())
  const latestSlots = useRef(slots)
  useEffect(() => { latestSlots.current = slots }, [slots])
  const expectPhoto = (index: number) => pendingFocus.current.set(index, slots[index]?.photo.id ?? null)

  // Stage fills the rest of the screen; the frame scales to fit it (min of width/height ratios).
  useLayoutEffect(() => {
    const element = stage.current
    if (!element) return
    const measure = () => setStageSize({ width: Math.max(0, element.clientWidth - 32), height: Math.max(0, element.clientHeight - 32) })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  const frameScale = stageSize ? Math.min(stageSize.width / template.canvas.width, stageSize.height / template.canvas.height) : 0

  // New photo in a pending slot: move its face (or the upper part of a portrait) to the slot centre.
  const slotPhotoIds = slots.map((slot) => slot?.photo.id ?? '').join('|')
  useEffect(() => {
    for (const [index, previousId] of [...pendingFocus.current]) {
      const slot = slots[index]
      const definition = template.slots[index]
      if (!slot || !definition || slot.photo.id === previousId) continue
      pendingFocus.current.delete(index)
      const image = new Image()
      image.src = slot.photo.previewSrc ?? slot.photo.src
      void image.decode().then(async () => {
        const focus = await photoFocus(image)
        // Face detection can take a few seconds the first time: skip if the customer already moved this photo.
        const now = latestSlots.current[index]
        if (now?.photo.id !== slot.photo.id || now.transform.scale !== 1 || now.transform.offsetX !== 0 || now.transform.offsetY !== 0) return
        onTransform(index, focusTransform(slot.transform, focus, { width: image.naturalWidth, height: image.naturalHeight }, { width: definition.width, height: definition.height }))
      }).catch(() => undefined)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs when a slot's photo changes
  }, [slotPhotoIds])

  /** Downloads only the originals actually used, with a progress chip; the editor stays usable. */
  const withBoothFiles = (photos: BoothPhoto[], use: (files: File[]) => void) => {
    if (!loadBoothOriginal || !photos.length) return
    setPoolProgress({ done: 0, total: photos.length })
    void loadBoothOriginals(photos, loadBoothOriginal, (done, total) => setPoolProgress({ done, total }))
      .then((files) => { if (files.length) use(files); else onPhotoError('Ảnh phòng chụp chưa tải được. Vui lòng kiểm tra mạng.') })
      .finally(() => setPoolProgress(null))
  }

  const usedNames = new Set(slots.flatMap((slot) => slot ? [slot.photo.alt] : []))
  const unusedTray = boothPhotos.filter((photo) => !usedNames.has(photo.name))
  const emptySlots = emptySlotsInOrder(template, slots)
  const filledCount = slots.length - emptySlots.length
  const remainingSlotCount = emptySlots.length

  const slotTarget = (slotIndex: number): DirectPhotoTarget => ({ templateId: template.id, slotIndex, slotCount: template.slots.length })
  const placeBoothPhoto = (photo: BoothPhoto, slotIndex: number) => withBoothFiles([photo], (files) => { if (files[0]) { expectPhoto(slotIndex); onPickPhoto(slotTarget(slotIndex), files[0]) } })

  /** Phone picker (or the booth sheet) for one slot. */
  const openPhotoPicker = (slotIndex: number, fromPhone = false) => {
    if (boothPhotos.length && !fromPhone) { setPoolRequest({ kind: 'slot', target: slotTarget(slotIndex) }); return }
    const input = photoInput.current
    if (!input) return
    pendingPhotoTarget.current = slotTarget(slotIndex)
    input.value = ''
    input.click()
  }
  const choosePhoto = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0]
    const target = pendingPhotoTarget.current
    event.currentTarget.value = ''
    pendingPhotoTarget.current = null
    if (file && target) { expectPhoto(target.slotIndex); onPickPhoto(target, file) }
  }
  const openFramePhotoPicker = () => {
    const input = framePhotoInput.current
    if (!input) return
    pendingFramePhotoTarget.current = { ...createFramePhotoTarget(template.id, slots), emptySlotIndices: emptySlots }
    input.value = ''
    input.click()
  }
  const chooseFramePhotos = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.currentTarget.files ?? [])
    const target = pendingFramePhotoTarget.current
    event.currentTarget.value = ''
    pendingFramePhotoTarget.current = null
    if (files.length && target) { target.emptySlotIndices.slice(0, files.length).forEach((index) => expectPhoto(index)); onPickFramePhotos(target, files) }
  }

  /** "+ Thêm ảnh": the next unused tray photo; none left → the booth sheet or the phone. */
  const addToSlot = (slotIndex: number) => {
    const next = unusedTray[0]
    if (next) placeBoothPhoto(next, slotIndex)
    else openPhotoPicker(slotIndex)
  }
  /** Tray tap: into the first empty slot. */
  const placeFromTray = (photo: BoothPhoto) => {
    const slotIndex = emptySlots[0]
    if (slotIndex === undefined) { onPhotoError('Khung đã đủ ảnh. Chạm một ô rồi chọn “Thay ảnh” để đổi.'); return }
    placeBoothPhoto(photo, slotIndex)
  }
  /** "Tự xếp": unused tray photos fill the empty slots of this frame (phone picker when there is no tray). */
  const autoArrange = () => {
    if (!emptySlots.length) return
    if (!boothPhotos.length) { openFramePhotoPicker(); return }
    const chosen = unusedTray.slice(0, emptySlots.length)
    if (!chosen.length) { onPhotoError('Đã dùng hết ảnh trong khay. Chọn thêm ảnh từ điện thoại hoặc ảnh phòng chụp.'); return }
    const target = { ...createFramePhotoTarget(template.id, slots), emptySlotIndices: emptySlots }
    withBoothFiles(chosen, (files) => { target.emptySlotIndices.slice(0, files.length).forEach((index) => expectPhoto(index)); onPickFramePhotos(target, files) })
  }

  const openAutoFillPicker = () => {
    setAutoFillDialogOpen(false)
    // Tự xếp tất cả khung uses the first 20 booth photos (shooting order) — at most ~75 MB to download.
    if (boothPhotos.length) { withBoothFiles(boothPhotos.slice(0, MAX_BOOTH_SELECTION), (files) => onAutoFillPhotos?.(files)); return }
    const input = autoFillPhotoInput.current
    if (!input) return
    input.value = ''
    input.click()
  }
  const chooseAutoFillPhotos = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.currentTarget.files ?? [])
    event.currentTarget.value = ''
    if (files.length) onAutoFillPhotos?.(files)
  }

  // Drag & drop: a tray photo onto a slot (place / replace), a filled slot onto another (swap).
  // Touch: tray photos start on an upward swipe or a long press (sideways swipes scroll the tray);
  // slots start on a long press so a tap still opens Chỉnh ô. Mouse: after a 6px move.
  const [dropTarget, setDropTarget] = useState<number | null>(null)
  const [dragImage, setDragImage] = useState<string | null>(null)
  const ghost = useRef<HTMLDivElement>(null)
  const pending = useRef<PendingDrag | null>(null)
  const justDragged = useRef(false)
  const slotAt = (x: number, y: number) => {
    const element = document.elementFromPoint(x, y)?.closest('[data-slot-index]')
    return element && stage.current?.contains(element) ? Number(element.getAttribute('data-slot-index')) : null
  }
  const moveGhost = (x: number, y: number) => { if (ghost.current) ghost.current.style.transform = `translate(${x - 30}px, ${y - 30}px)` }
  const activate = (drag: PendingDrag, x: number, y: number) => {
    drag.active = true
    setDragImage(drag.image ?? '')
    requestAnimationFrame(() => moveGhost(x, y))
    try { navigator.vibrate?.(12) } catch { /* not supported */ }
  }
  const endDrag = (drop: boolean) => {
    const drag = pending.current
    pending.current = null
    window.removeEventListener('pointermove', onWindowMove)
    window.removeEventListener('pointerup', onWindowUp)
    window.removeEventListener('pointercancel', onWindowCancel)
    if (!drag) return
    if (drag.timer !== null) clearTimeout(drag.timer)
    if (!drag.active) return
    justDragged.current = true
    window.setTimeout(() => { justDragged.current = false }, 0)
    setDragImage(null)
    setDropTarget(null)
    if (!drop || drag.target === null) return
    if (drag.item.kind === 'tray') placeBoothPhoto(drag.item.photo, drag.target)
    else if (drag.target !== drag.item.index) onSwapSlots?.(drag.item.index, drag.target)
  }
  function onWindowMove(event: PointerEvent) {
    const drag = pending.current
    if (!drag || event.pointerId !== drag.pointerId) return
    const dx = event.clientX - drag.startX
    const dy = event.clientY - drag.startY
    if (!drag.active) {
      const moved = Math.hypot(dx, dy)
      if (drag.pointerType === 'mouse' ? moved > 6 : drag.item.kind === 'tray' && dy < -10 && Math.abs(dy) > Math.abs(dx)) activate(drag, event.clientX, event.clientY)
      else if (drag.pointerType !== 'mouse' && moved > 10) { endDrag(false); return }
      if (!drag.active) return
    }
    event.preventDefault()
    moveGhost(event.clientX, event.clientY)
    const target = slotAt(event.clientX, event.clientY)
    if (target !== drag.target) { drag.target = target; setDropTarget(target) }
  }
  function onWindowUp(event: PointerEvent) { if (pending.current?.pointerId === event.pointerId) endDrag(true) }
  function onWindowCancel(event: PointerEvent) { if (pending.current?.pointerId === event.pointerId) endDrag(false) }
  const startDrag = (item: DragItem, image: string | null, event: ReactPointerEvent<HTMLElement>) => {
    if (busy || (event.pointerType === 'mouse' && event.button !== 0)) return
    if (pending.current) endDrag(false)
    const drag: PendingDrag = { item, pointerId: event.pointerId, pointerType: event.pointerType, startX: event.clientX, startY: event.clientY, timer: null, active: false, target: null, image }
    if (event.pointerType !== 'mouse') drag.timer = window.setTimeout(() => { drag.timer = null; if (pending.current === drag) activate(drag, drag.startX, drag.startY) }, LONG_PRESS_MS)
    pending.current = drag
    window.addEventListener('pointermove', onWindowMove, { passive: false })
    window.addEventListener('pointerup', onWindowUp)
    window.addEventListener('pointercancel', onWindowCancel)
  }
  useEffect(() => () => endDrag(false), []) // eslint-disable-line react-hooks/exhaustive-deps -- unmount cleanup only

  const openEditor = (index: number) => { if (justDragged.current) return; onCurrentSlotChange(index); setEditIndex(index) }
  const saveEdits = (edits: Record<number, SlotTransform>) => { for (const [index, transform] of Object.entries(edits)) onTransform(Number(index), transform) }

  const frameName = frames.length ? frameCode(frameIndex) : template.name
  const canContinue = Boolean(onOpenSendFrames) && slots.length > 0 && remainingSlotCount === 0
  const printLabel = [printSize && /^\s*\d+([.,]\d+)?\s*[x×]\s*\d+([.,]\d+)?\s*(cm|in)?\s*$/i.test(printSize) ? printSize.replace(/\s*[x×]\s*/i, '×') : null, `${template.slots.length} ô`].filter(Boolean).join(' · ')
  const busy = Boolean(poolProgress) || autoFillPreparing

  return <PageShell bottomBar={<BottomBar><div className="grid grid-cols-[auto_minmax(0,1fr)] gap-2.5">
    <Button className="whitespace-nowrap" disabled={frames.length < 2 || !onSelectFrame} onClick={() => setFramesOpen(true)} variant="chrome">Khung khác</Button>
    <Button disabled={!canContinue} onClick={onOpenSendFrames} trailingIcon={canContinue ? <Icon name="arrowRight" /> : undefined}>{canContinue ? 'Lưu & tiếp tục' : `Còn ${remainingSlotCount} ô trống`}</Button>
  </div></BottomBar>} className="overflow-x-hidden" footer={false}>
    <input accept="image/*" aria-label="Chọn một ảnh từ điện thoại" className="sr-only" onChange={choosePhoto} ref={photoInput} type="file" />
    <input accept="image/*" aria-label="Chọn nhiều ảnh từ điện thoại" className="sr-only" multiple onChange={chooseFramePhotos} ref={framePhotoInput} type="file" />
    <input accept="image/*" aria-label="Chọn ảnh cho tất cả khung" className="sr-only" multiple onChange={chooseAutoFillPhotos} ref={autoFillPhotoInput} type="file" />
    <header className="grid grid-cols-[2.75rem_minmax(0,1fr)_auto] items-center gap-3">
      <button aria-label="Quay lại chọn phòng" className={roundBackClass} onClick={onBack} type="button"><Icon name="back" /></button>
      <div className="min-w-0"><h1 className="truncate text-[17px] font-black leading-tight tracking-[-0.02em]">Ghép khung · {frameName}</h1><p className="truncate text-[12px] font-semibold text-cs-ink-2">Đã ghép {filledCount}/{slots.length} ô · chạm ô để chỉnh</p></div>
      <span className="cs-mono text-xs text-cs-ink-2">{stepCounter(3)}</span>
    </header>
    <div className="mt-2.5"><Stepper compact step={3} /></div>

    <section aria-label="Khung in" className="cs-lcd relative mt-3 flex min-h-[300px] flex-1 items-center justify-center rounded-[28px]" ref={stage}>
      {frameScale > 0 ? <div style={{ width: template.canvas.width * frameScale }}>
        <TemplateCanvas backgroundUrl={backgroundUrl} dropTarget={dropTarget} mode="layout" onAddSlot={addToSlot} onImageError={onPhotoError} onOpenSlot={openEditor} onRemove={onRemove} onSlotPointerDown={onSwapSlots ? (index, event) => startDrag({ kind: 'slot', index }, slots[index]?.photo.previewSrc ?? slots[index]?.photo.src ?? null, event) : undefined} slots={slots} template={template} />
      </div> : null}
      <button aria-label="Tuỳ chọn khung" className="absolute left-2 top-2 grid size-11 place-items-center rounded-full bg-white/12 text-white" onClick={() => setOptionsOpen(true)} type="button"><Icon className="size-5" name="sparkles" /></button>
      <button aria-label="Xem cả khung toàn màn hình" className="absolute right-2 top-2 grid size-11 place-items-center rounded-full bg-white/12 text-white" onClick={() => setViewerOpen(true)} type="button"><Icon className="size-5" name="expand" /></button>
      {allBwEnabled ? <p className="cs-mono pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 text-[10px] text-white/70">Đen trắng</p> : null}
    </section>

    <div className="mt-2.5 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
      {boothPhotos.length ? <ul aria-label="Khay ảnh" className="flex min-w-0 gap-1.5 overflow-x-auto overscroll-x-contain rounded-[14px] bg-cs-graphite/5 p-1.5 [scrollbar-width:none]">
        {boothPhotos.map((photo, index) => {
          const used = usedNames.has(photo.name)
          return <li className="shrink-0" key={photo.id}><button aria-label={used ? `Ảnh ${index + 1}, đã dùng` : `Thêm ảnh ${index + 1} vào ô trống`} className={`relative block size-[46px] touch-pan-x select-none overflow-hidden rounded-[10px] bg-cs-graphite [-webkit-touch-callout:none] ${used ? 'opacity-55' : ''}`} disabled={busy} onClick={() => { if (!justDragged.current) placeFromTray(photo) }} onContextMenu={(event) => event.preventDefault()} onPointerDown={(event) => startDrag({ kind: 'tray', photo }, photo.thumbUrl, event)} title="Chạm để thêm · kéo vào ô" type="button">{photo.thumbUrl ? <img alt="" className="pointer-events-none h-full w-full object-cover" decoding="async" draggable={false} loading="lazy" src={photo.thumbUrl} /> : null}{used ? <span aria-hidden="true" className="cs-led absolute right-0.5 top-0.5 grid size-4 place-items-center rounded-full text-white"><Icon className="size-3" name="check" /></span> : null}</button></li>
        })}
      </ul> : <button className="cs-btn-chrome cs-press flex min-h-[58px] items-center justify-center gap-2 rounded-[14px] px-3 text-[14px] font-bold" onClick={() => emptySlots.length ? openFramePhotoPicker() : setBrowseBooth(true)} type="button"><Icon className="size-5" name="mobile" />{emptySlots.length ? 'Chọn ảnh từ điện thoại' : 'Ảnh phòng chụp'}</button>}
      <button aria-busy={busy || undefined} className="cs-btn-chrome cs-press flex min-h-[58px] items-center gap-1.5 rounded-[14px] px-4 text-[15px] font-bold disabled:opacity-40" disabled={!emptySlots.length || busy} onClick={autoArrange} type="button">{busy ? <Spinner className="size-4" /> : <Icon className="size-[18px]" name="sparkles" />}Tự xếp</button>
    </div>

    {dragImage !== null ? <div aria-hidden="true" className="pointer-events-none fixed left-0 top-0 z-[75] size-[60px] overflow-hidden rounded-[12px] border-2 border-white bg-cs-graphite shadow-[0_10px_28px_rgba(0,0,0,.45)]" ref={ghost} style={{ transform: 'translate(-200px, -200px)' }}>{dragImage ? <img alt="" className="h-full w-full object-cover" src={dragImage} /> : null}</div> : null}
    {editIndex !== null && slots[editIndex] ? <SlotEditor allBwEnabled={allBwEnabled} backgroundUrl={backgroundUrl} frameName={frameName} initialIndex={editIndex} key={`${template.id}:${editIndex}`} onCancel={() => setEditIndex(null)} onDone={(edits) => { saveEdits(edits); setEditIndex(null) }} onRemove={(index, edits) => { saveEdits(edits); setEditIndex(null); onRemove(index) }} onReplace={(index, edits) => { saveEdits(edits); setEditIndex(null); openPhotoPicker(index) }} slots={slots} template={template} templateDpi={templateDpi(template.canvas, printSize)} /> : null}
    {viewerOpen ? <FrameViewer backgroundUrl={backgroundUrl} onClose={() => setViewerOpen(false)} slots={slots} template={template} /> : null}
    {optionsOpen ? <BottomSheet onClose={() => setOptionsOpen(false)} subtitle={printLabel} title={`Tuỳ chọn · ${frameName}`}>
      <div className="grid gap-2">
        <OptionButton icon="camera" label={boothPhotos.length ? `Ảnh phòng chụp (${boothPhotos.length})` : 'Ảnh phòng chụp'} onClick={() => { setOptionsOpen(false); setBrowseBooth(true) }} />
        <OptionButton icon="mobile" label="Thêm ảnh từ điện thoại" onClick={() => { setOptionsOpen(false); openFramePhotoPicker() }} disabled={!emptySlots.length} detail={emptySlots.length ? `Vào ${emptySlots.length} ô trống` : 'Khung đã đủ ảnh'} />
        <OptionButton icon="sparkles" label="Tự xếp tất cả khung" onClick={() => { setOptionsOpen(false); setAutoFillDialogOpen(true) }} disabled={!onAutoFillPhotos || !autoFillPhotoCount || busy} detail="Chia ảnh vào mọi khung của phòng" />
        <OptionButton icon="contrast" label="Đen trắng tất cả" onClick={() => onToggleAllBw?.()} disabled={!onToggleAllBw || downloading} pressed={allBwEnabled} />
        {onDownload ? <OptionButton icon="download" label={downloading ? 'Đang lưu…' : 'Lưu khung về máy'} onClick={() => { setOptionsOpen(false); onDownload() }} disabled={remainingSlotCount > 0 || downloading} detail={remainingSlotCount > 0 ? `Còn ${remainingSlotCount} ô trống` : undefined} /> : null}
      </div>
    </BottomSheet> : null}

    {poolRequest ? <BoothPoolSheet mode="pick" capacity={poolRequest.kind === 'slot' ? 1 : Math.max(1, poolRequest.target.emptySlotIndices.length)} slotNumbers={template.slots.length > 1 ? (poolRequest.kind === 'slot' ? [poolRequest.target.slotIndex + 1] : poolRequest.target.emptySlotIndices.map((slot) => slot + 1)) : []} onClose={() => setPoolRequest(null)} onConfirm={(ids) => {
      const request = poolRequest
      setPoolRequest(null)
      const chosen = ids.map((id) => boothPhotos.find((photo) => photo.id === id)).filter((photo): photo is BoothPhoto => Boolean(photo))
      withBoothFiles(chosen, (files) => {
        if (request.kind === 'slot' && files[0]) { expectPhoto(request.target.slotIndex); onPickPhoto(request.target, files[0]) }
        if (request.kind === 'frame') { request.target.emptySlotIndices.slice(0, files.length).forEach((index) => expectPhoto(index)); onPickFramePhotos(request.target, files) }
      })
    }} onUsePhone={() => {
      const request = poolRequest
      setPoolRequest(null)
      if (request.kind === 'slot') openPhotoPicker(request.target.slotIndex, true)
      else openFramePhotoPicker()
    }} photos={boothPhotos} /> : null}
    {browseBooth ? <BoothPoolSheet mode="browse" onClose={() => setBrowseBooth(false)} photos={boothPhotos} /> : null}
    {framesOpen && onSelectFrame ? <FrameSwitcherSheet currentIndex={frameIndex} frames={frames} onClose={() => setFramesOpen(false)} onSelect={(index) => { setFramesOpen(false); setEditIndex(null); if (index !== frameIndex) onSelectFrame(index) }} /> : null}
    {poolProgress ? <div className="cs-lcd pointer-events-none fixed inset-x-4 top-[max(16px,env(safe-area-inset-top))] z-[60] mx-auto flex max-w-xs items-center justify-center gap-2 rounded-full px-4 py-2.5 text-[13px] font-bold" role="status"><Spinner className="size-4" />{`Đang tải ảnh phòng chụp ${poolProgress.done}/${poolProgress.total}…`}</div> : null}
    {saveConfirmation ? <div className="fixed inset-x-4 top-[max(16px,env(safe-area-inset-top))] z-[70] mx-auto max-w-sm rounded-[16px] border border-cs-alert-success-border bg-cs-alert-success-bg px-4 py-3 text-center text-sm font-bold text-cs-alert-success-fg shadow-2xl" role="status">{saveConfirmation}</div> : null}
    {autoFillDialogOpen && autoFillPhotoCount ? <div aria-labelledby="auto-fill-title" aria-modal="true" className="fixed inset-0 z-[80] grid place-items-center bg-[rgba(13,14,16,.55)] p-4" role="dialog"><div className="cs-panel w-full max-w-sm rounded-[28px] p-5"><h2 className="text-xl font-black tracking-[-0.02em]" id="auto-fill-title">Tự xếp ảnh vào tất cả khung</h2><p className="mt-2 text-[15px] leading-normal text-cs-ink-2">{autoFillHasExistingPhotos ? 'Tự xếp sẽ thay các ảnh đang có trong các khung của phòng này. Tiếp tục?' : boothPhotos.length ? `Ảnh phòng chụp sẽ được xếp lần lượt vào các khung của phòng (tối đa ${MAX_BOOTH_SELECTION} ảnh).` : `Chọn bao nhiêu ảnh cũng được, ảnh sẽ được chia vào các khung. Chọn ${autoFillPhotoCount} ảnh để lấp đầy cả phòng.`}</p><div className="mt-5 grid grid-cols-2 gap-2.5"><Button onClick={() => setAutoFillDialogOpen(false)} variant="chrome">Huỷ</Button><Button onClick={openAutoFillPicker}>Tiếp tục</Button></div></div></div> : null}
    {photoError ? <div className="fixed inset-x-4 top-[max(16px,env(safe-area-inset-top))] z-[70] mx-auto flex max-w-md items-center justify-between gap-3 rounded-[16px] border border-cs-alert-error-border bg-cs-alert-error-bg py-2 pl-4 pr-2 text-sm font-semibold text-cs-alert-error-fg shadow-2xl" role="alert"><span>{photoError}</span><button className="min-h-11 shrink-0 rounded-xl px-3 font-bold underline" onClick={onClearPhotoError} type="button">Đóng</button></div> : null}
  </PageShell>
}
