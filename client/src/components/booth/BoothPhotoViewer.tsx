import { useEffect, useRef, useState } from 'react'
import type { BoothPhoto } from '../../features/boothPhotos/boothPhotosClient'
import { Icon } from '../ui/Icon'

interface BoothPhotoViewerProps {
  photos: BoothPhoto[]
  index: number
  selectedIds: string[]
  /** Pick mode: slot each selection goes into (selection order). */
  slotNumbers?: number[]
  onIndexChange: (index: number) => void
  /** Pick mode only; without it the viewer is view-only (no selection, no saving). */
  onToggle?: (id: string) => void
  onClose: () => void
}

const roundButton = 'grid size-11 place-items-center rounded-full border border-white/30 bg-[rgba(13,14,16,.72)] text-white disabled:opacity-30'

/** Full-screen view of one booth photo with previous/next (buttons, swipe, arrow keys). */
export function BoothPhotoViewer({ photos, index, selectedIds, slotNumbers = [], onIndexChange, onToggle, onClose }: BoothPhotoViewerProps) {
  const photo = photos[index]
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null)
  // One-finger horizontal flick only: a pinch-zoom, a vertical drag or a slow drag must not change photo.
  const touchStart = useRef<{ x: number; y: number; at: number } | null>(null)
  const go = (step: number) => { const next = index + step; if (next >= 0 && next < photos.length) onIndexChange(next) }
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.stopPropagation(); onClose() }
      if (event.key === 'ArrowLeft') go(-1)
      if (event.key === 'ArrowRight') go(1)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })
  // Once the current photo is sharp, warm the browser cache with the previews of the photos
  // just before and after it, so "tới / lui" is instant. Previews only (~400 KB): a photo without
  // one is not preloaded, to spare the customer 6 MB of mobile data per photo.
  const currentLarge = photo ? photo.previewUrl || photo.originalUrl : null
  const currentReady = loadedUrl !== null && loadedUrl === currentLarge
  useEffect(() => {
    if (!currentReady) return
    // Not cancelled on navigation: the photo the customer moves to is usually the one being fetched.
    for (const item of [photos[index + 1], photos[index - 1]]) if (item?.previewUrl) { const image = new Image(); image.decoding = 'async'; image.src = item.previewUrl }
  }, [currentReady, index, photos])
  if (!photo) return null
  const order = selectedIds.indexOf(photo.id)
  const selected = order >= 0
  // The 1600px preview (~250 KB) when the booth PC sent one; otherwise the original.
  const largeUrl = photo.previewUrl || photo.originalUrl
  const showingOriginal = loadedUrl === largeUrl
  const selectedLabel = slotNumbers[order] ? `Đã chọn · vào hình ${slotNumbers[order]} (bỏ chọn)` : `Đã chọn · thứ tự ${order + 1} (bỏ chọn)`
  return <div aria-label={`Ảnh ${index + 1} / ${photos.length}`} aria-modal="true" className="fixed inset-0 z-[90] flex flex-col bg-[radial-gradient(120%_60%_at_50%_0%,#2A2D32_0%,#0B0C0E_60%)] text-white" role="dialog"
    onTouchEnd={(event) => {
      const start = touchStart.current; touchStart.current = null
      if (!start || event.touches.length > 0) return
      const end = event.changedTouches[0]!
      const dx = end.clientX - start.x, dy = end.clientY - start.y
      if (Math.abs(dx) > 60 && Math.abs(dx) > 2 * Math.abs(dy) && Date.now() - start.at < 700) go(dx < 0 ? 1 : -1)
    }}
    onTouchMove={(event) => { if (event.touches.length > 1) touchStart.current = null }}
    onTouchStart={(event) => { const touch = event.touches[0]!; touchStart.current = event.touches.length === 1 ? { x: touch.clientX, y: touch.clientY, at: Date.now() } : null }}>
    <div className="mx-auto grid w-full max-w-[430px] grid-cols-[2.75rem_1fr_2.75rem] items-center px-4 pt-[max(12px,env(safe-area-inset-top))]"><button aria-label="Đóng" className="cs-btn-chrome cs-press grid size-11 place-items-center rounded-full" onClick={onClose} type="button"><Icon name="close" /></button><span className="cs-mono text-center text-sm">{index + 1} / {photos.length}</span><span /></div>
    <div className="relative mx-auto my-4 min-h-0 w-full max-w-[430px] flex-1 px-4">
      <div className={`relative h-full overflow-hidden rounded-[20px] ${selected ? 'ring-[3px] ring-cs-led' : ''}`}>
        {/* Thumbnail first (instant), then the original once it has loaded. */}
        {photo.thumbUrl && !showingOriginal ? <img alt="" className="absolute inset-0 h-full w-full object-contain" src={photo.thumbUrl} /> : null}
        <img alt={`Ảnh ${index + 1}`} className={`absolute inset-0 h-full w-full object-contain transition-opacity ${showingOriginal ? 'opacity-100' : 'opacity-0'}`} key={largeUrl} onLoad={() => setLoadedUrl(largeUrl)} src={largeUrl} />
        {!showingOriginal ? <span className="absolute bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-black/60 px-3 py-1 text-xs font-bold">Đang tải ảnh rõ nét…</span> : null}
      </div>
      <button aria-label="Ảnh trước" className={`${roundButton} absolute left-1 top-1/2 -translate-y-1/2`} disabled={index === 0} onClick={() => go(-1)} type="button"><Icon name="back" /></button>
      <button aria-label="Ảnh sau" className={`${roundButton} absolute right-1 top-1/2 -translate-y-1/2`} disabled={index === photos.length - 1} onClick={() => go(1)} type="button"><Icon name="chevronRight" /></button>
    </div>
    {onToggle ? <div className="mx-auto w-full max-w-[430px] px-4 pb-[max(16px,env(safe-area-inset-bottom))]">
      <button aria-pressed={selected} className={`min-h-14 w-full rounded-[16px] px-3 text-[15px] font-extrabold ${selected ? 'border-2 border-cs-led bg-transparent text-white' : 'cs-btn-chrome'}`} onClick={() => onToggle(photo.id)} type="button">{selected ? selectedLabel : 'Chọn ảnh này'}</button>
    </div> : <div className="pb-[max(16px,env(safe-area-inset-bottom))]" />}
  </div>
}
