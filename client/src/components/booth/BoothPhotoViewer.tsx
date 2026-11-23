import { useEffect, useRef, useState } from 'react'
import type { BoothPhoto } from '../../features/boothPhotos/boothPhotosClient'

interface BoothPhotoViewerProps {
  photos: BoothPhoto[]
  index: number
  selectedIds: string[]
  onIndexChange: (index: number) => void
  onToggle: (id: string) => void
  onDownload: (photo: BoothPhoto) => void
  downloadLabel: (photo: BoothPhoto) => string
  onClose: () => void
}

/** Full-screen view of one booth photo with previous/next (buttons, swipe, arrow keys). */
export function BoothPhotoViewer({ photos, index, selectedIds, onIndexChange, onToggle, onDownload, downloadLabel, onClose }: BoothPhotoViewerProps) {
  const photo = photos[index]
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null)
  const touchStart = useRef<number | null>(null)
  const go = (step: number) => { const next = index + step; if (next >= 0 && next < photos.length) onIndexChange(next) }
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key === 'ArrowLeft') go(-1)
      if (event.key === 'ArrowRight') go(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
  if (!photo) return null
  const selected = selectedIds.includes(photo.id)
  const showingOriginal = loadedUrl === photo.originalUrl
  return <div aria-label={`Ảnh ${index + 1} / ${photos.length}`} aria-modal="true" className="fixed inset-0 z-[90] flex flex-col bg-stone-950 text-white" role="dialog"
    onTouchEnd={(event) => { const start = touchStart.current; touchStart.current = null; if (start === null) return; const dx = event.changedTouches[0]!.clientX - start; if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1) }}
    onTouchStart={(event) => { touchStart.current = event.touches[0]!.clientX }}>
    <div className="flex items-center justify-between p-3"><button aria-label="Đóng" className="grid size-11 place-items-center rounded-full bg-white/10 text-xl font-black" onClick={onClose} type="button">✕</button><span className="text-sm font-bold">{index + 1} / {photos.length}</span><span className="size-11" /></div>
    <div className="relative min-h-0 flex-1">
      {/* Thumbnail first (instant), then the original once it has loaded. */}
      {photo.thumbUrl && !showingOriginal ? <img alt="" className="absolute inset-0 h-full w-full object-contain" src={photo.thumbUrl} /> : null}
      <img alt={`Ảnh ${index + 1}`} className={`absolute inset-0 h-full w-full object-contain transition-opacity ${showingOriginal ? 'opacity-100' : 'opacity-0'}`} key={photo.originalUrl} onLoad={() => setLoadedUrl(photo.originalUrl)} src={photo.originalUrl} />
      {!showingOriginal ? <span className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-xs font-bold">Đang tải ảnh rõ nét…</span> : null}
    </div>
    <div className="grid grid-cols-[auto_1fr_1fr_auto] items-center gap-2 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <button aria-label="Ảnh trước" className="grid size-12 place-items-center rounded-full bg-white/10 text-2xl font-black disabled:opacity-30" disabled={index === 0} onClick={() => go(-1)} type="button">‹</button>
      <button className={`min-h-12 rounded-2xl px-2 text-sm font-black ${selected ? 'bg-[var(--brand-primary)] text-white' : 'bg-white text-stone-950'}`} onClick={() => onToggle(photo.id)} type="button">{selected ? '✓ Đã chọn' : 'Chọn ảnh này'}</button>
      <button className="min-h-12 rounded-2xl bg-white/15 px-2 text-sm font-black" onClick={() => onDownload(photo)} type="button">{downloadLabel(photo)}</button>
      <button aria-label="Ảnh sau" className="grid size-12 place-items-center rounded-full bg-white/10 text-2xl font-black disabled:opacity-30" disabled={index === photos.length - 1} onClick={() => go(1)} type="button">›</button>
    </div>
  </div>
}
