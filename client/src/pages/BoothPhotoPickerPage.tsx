import { useEffect, useRef, useState } from 'react'
import { BoothPhotoViewer } from '../components/booth/BoothPhotoViewer'
import { deliverImageFiles } from '../features/orders/services/saveComposition'
import { PageShell } from '../components/layout/PageShell'
import { downloadBoothPhotos, prefersShareSheet, type BoothPhoto, type BoothPhotoList } from '../features/boothPhotos/boothPhotosClient'

interface BoothPhotoPickerPageProps {
  phone: string
  list: BoothPhotoList | null
  error: string | null
  selectedIds: string[]
  onSelectedIdsChange: (ids: string[]) => void
  onContinue: (photos: BoothPhoto[]) => Promise<void>
  onSkip: () => void
  onBack: () => void
  /** Original file (downloaded once, shared with the editor's pool). */
  loadOriginal: (photo: BoothPhoto) => Promise<File>
}

/**
 * Shown after "Enter Room" when the phone has booth photos: a thumbnail grid (no
 * originals, no Image Transformations); the customer ticks the photos to use.
 */
export function BoothPhotoPickerPage({ phone, list, error, selectedIds, onSelectedIdsChange, onContinue, onSkip, onBack, loadOriginal }: BoothPhotoPickerPageProps) {
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const photos = list?.status === 'ok' ? list.photos : []
  const selected = new Set(selectedIds)
  const selectedPhotos = photos.filter((photo) => selected.has(photo.id))
  const toggle = (id: string) => onSelectedIdsChange(selected.has(id) ? selectedIds.filter((item) => item !== id) : [...selectedIds, id])
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)
  const [readyFiles, setReadyFiles] = useState<Record<string, File>>({})
  const [preparing, setPreparing] = useState(false)
  const lastTap = useRef<{ id: string; time: number } | null>(null)
  // Ticked photos are already downloading (prefetch); remember which originals are ready.
  useEffect(() => {
    for (const photo of photos) if (selected.has(photo.id) && !readyFiles[photo.id]) loadOriginal(photo).then((file) => setReadyFiles((current) => ({ ...current, [photo.id]: file })), () => undefined)
  })
  const tapTile = (index: number, id: string, now: number) => {
    const double = lastTap.current?.id === id && now - lastTap.current.time < 320
    lastTap.current = double ? null : { id, time: now }
    toggle(id) // a double tap toggles twice, leaving the selection unchanged
    if (double) setViewerIndex(index)
  }
  /**
   * Share sheets need a fresh tap: if every original is ready, open it now; otherwise
   * download first and the button turns into "Lưu … vào máy" for a second tap.
   */
  const useShareSheet = prefersShareSheet()
  const download = async (items: BoothPhoto[]) => {
    if (!items.length || preparing) return
    if (!useShareSheet) { await downloadBoothPhotos(items); return }
    if (items.every((photo) => readyFiles[photo.id])) { await deliverImageFiles(items.map((photo) => readyFiles[photo.id]!)); return }
    setPreparing(true)
    setLoadError(null)
    try {
      const files = await Promise.all(items.map((photo) => loadOriginal(photo)))
      setReadyFiles((current) => ({ ...current, ...Object.fromEntries(items.map((photo, index) => [photo.id, files[index]!])) }))
    } catch { setLoadError('Không tải được ảnh. Vui lòng kiểm tra mạng rồi thử lại.') }
    finally { setPreparing(false) }
  }
  const selectedReady = selectedPhotos.length > 0 && selectedPhotos.every((photo) => readyFiles[photo.id])
  const confirm = async () => {
    if (!selectedPhotos.length || loading) return
    setLoading(true)
    setLoadError(null)
    try { await onContinue(selectedPhotos) }
    catch (reason) { setLoadError(reason instanceof Error ? reason.message : 'Không tải được ảnh. Vui lòng thử lại.') }
    finally { setLoading(false) }
  }

  return <PageShell className="pb-32">
    <div className="flex items-center justify-between pb-6"><button className="min-h-11 rounded-full bg-white px-4 text-sm font-semibold shadow-sm" onClick={onBack} type="button">← Rooms</button><span className="rounded-full bg-white px-4 py-2 text-sm font-bold shadow-sm" aria-live="polite">Đã chọn {selectedPhotos.length} / {photos.length}</span></div>
    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand-primary)]">Ảnh từ phòng chụp · {phone}</p>
    <h1 className="mt-1 text-3xl font-black tracking-tight">Chọn ảnh bạn muốn in</h1>
    <p className="mt-2 text-sm text-stone-600">Chạm vào ảnh để chọn, chạm đúp hoặc ⤢ để xem lớn. Ảnh vừa chụp sẽ tự hiện thêm sau vài giây.</p>
    {list?.status === 'ok' ? <p className="mt-1 text-xs text-stone-500">Ảnh được lưu 3 ngày rồi tự xoá.</p> : null}
    <div className="mt-4 flex gap-2"><button className="min-h-11 rounded-xl bg-white px-4 text-sm font-bold shadow-sm" onClick={() => onSelectedIdsChange(photos.map((photo) => photo.id))} type="button">Chọn tất cả</button><button className="min-h-11 rounded-xl bg-white px-4 text-sm font-bold shadow-sm disabled:opacity-40" disabled={!selectedPhotos.length} onClick={() => onSelectedIdsChange([])} type="button">Bỏ chọn</button></div>
    {error ? <p className="mt-4 rounded-2xl bg-rose-50 p-4 text-sm font-semibold text-rose-700" role="alert">{error}</p> : null}
    {list === null && !error ? <p className="mt-8 text-center font-semibold text-stone-500" role="status">Đang tải ảnh…</p> : null}
    {list?.status === 'unavailable' ? <p className="mt-8 rounded-2xl bg-white p-6 text-center text-stone-600">Chưa có ảnh từ phòng chụp cho số này. Vui lòng chờ vài giây, hoặc chọn ảnh từ điện thoại.</p> : null}
    <ul className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
      {photos.map((photo, index) => {
        const isSelected = selected.has(photo.id)
        return <li key={photo.id}><div className="relative"><button aria-label={`Ảnh ${index + 1}`} aria-pressed={isSelected} className={`relative block aspect-[2/3] w-full overflow-hidden rounded-xl bg-stone-200 ring-offset-2 ${isSelected ? 'ring-4 ring-[var(--brand-primary)]' : ''}`} onClick={(event) => tapTile(index, photo.id, event.timeStamp)} type="button">
          {photo.thumbUrl ? <img alt="" className="h-full w-full object-cover" decoding="async" loading="lazy" src={photo.thumbUrl} /> : <span className="grid h-full place-items-center text-xs text-stone-500">Ảnh {index + 1}</span>}
          <span className={`absolute right-1.5 top-1.5 grid size-7 place-items-center rounded-full border-2 border-white text-sm font-black text-white shadow ${isSelected ? 'bg-[var(--brand-primary)]' : 'bg-stone-950/30'}`}>{isSelected ? '✓' : ''}</span>
        </button><button aria-label={`Xem lớn ảnh ${index + 1}`} className="absolute bottom-1.5 right-1.5 grid size-9 place-items-center rounded-full bg-stone-950/55 text-base font-black text-white shadow" onClick={() => setViewerIndex(index)} type="button">⤢</button></div></li>
      })}
    </ul>
    <div className="fixed inset-x-0 bottom-0 z-20 border-t border-stone-200 bg-white p-3">
      {loadError ? <p className="mx-auto mb-2 max-w-3xl text-sm font-semibold text-rose-700" role="alert">{loadError}</p> : null}
      {selectedPhotos.length ? <button className="mx-auto mb-2 flex min-h-11 w-full max-w-3xl items-center justify-center rounded-2xl bg-stone-100 px-3 text-sm font-black disabled:opacity-50" disabled={useShareSheet && preparing} onClick={() => void download(selectedPhotos)} type="button">{!useShareSheet ? `⬇ Tải ${selectedPhotos.length} ảnh đã chọn về máy` : preparing ? 'Đang chuẩn bị ảnh…' : selectedReady ? `⬇ Lưu ${selectedPhotos.length} ảnh vào máy` : `⬇ Tải ${selectedPhotos.length} ảnh đã chọn về máy`}</button> : null}
      <div className="mx-auto flex max-w-3xl gap-2">
        <button className="min-h-12 flex-1 rounded-2xl border-2 border-stone-950 bg-white px-3 text-sm font-black" onClick={onSkip} type="button">Dùng ảnh điện thoại</button>
        <button className="min-h-12 flex-[2] rounded-2xl bg-stone-950 px-3 text-sm font-black text-white disabled:opacity-35" disabled={!selectedPhotos.length || loading} onClick={() => void confirm()} type="button">{loading ? 'ĐANG TẢI ẢNH…' : `DÙNG ${selectedPhotos.length} ẢNH ĐÃ CHỌN →`}</button>
      </div>
    </div>
    {viewerIndex !== null ? <BoothPhotoViewer downloadLabel={(photo) => (!useShareSheet ? '⬇ Tải về' : preparing ? 'Đang chuẩn bị…' : readyFiles[photo.id] ? '⬇ Lưu vào máy' : '⬇ Tải về')} index={viewerIndex} onClose={() => setViewerIndex(null)} onDownload={(photo) => void download([photo])} onIndexChange={setViewerIndex} onToggle={toggle} photos={photos} selectedIds={selectedIds} /> : null}
  </PageShell>
}
