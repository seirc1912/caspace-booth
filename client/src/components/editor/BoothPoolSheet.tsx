import { useState } from 'react'
import { BoothPhotoViewer } from '../booth/BoothPhotoViewer'
import { downloadBoothPhotos, MAX_BOOTH_SELECTION, prefersShareSheet, type BoothPhoto } from '../../features/boothPhotos/boothPhotosClient'
import { deliverImageFiles } from '../../features/orders/services/saveComposition'

interface BoothPoolSheetProps {
  photos: BoothPhoto[]
  /**
   * pick: "Add Image / Add Photos" — choose photos for the frame (capacity, slotNumbers).
   * browse: header "Ảnh phòng chụp" — view large and save up to 20 photos to the phone.
   */
  mode: 'pick' | 'browse'
  capacity?: number
  /** 1-based slot numbers the chosen photos fill, in order (e.g. [1, 2]); empty for single-photo frames. */
  slotNumbers?: number[]
  /** pick mode: chosen ids in pick order; the editor downloads their originals. */
  onConfirm?: (ids: string[]) => void
  onUsePhone?: () => void
  /** Original file (cached; used for the iPhone share sheet). */
  loadOriginal: (photo: BoothPhoto) => Promise<File>
  onClose: () => void
}

/**
 * Booth photos inside the editor: thumbnails only (instant); originals are fetched
 * only for the photos actually placed, viewed large or saved.
 */
export function BoothPoolSheet({ photos, mode, capacity = MAX_BOOTH_SELECTION, slotNumbers = [], onConfirm, onUsePhone, loadOriginal, onClose }: BoothPoolSheetProps) {
  const limit = mode === 'browse' ? MAX_BOOTH_SELECTION : capacity
  const [selected, setSelected] = useState<string[]>([])
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)
  const [readyFiles, setReadyFiles] = useState<Record<string, File>>({})
  const [preparing, setPreparing] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const useShareSheet = prefersShareSheet()
  const chosen = selected.map((id) => photos.find((photo) => photo.id === id)).filter((photo): photo is BoothPhoto => Boolean(photo))
  const toggle = (id: string) => {
    if (selected.includes(id)) { setSelected(selected.filter((item) => item !== id)); return }
    if (limit === 1) { setSelected([id]); return }
    if (selected.length >= limit) { setNotice(mode === 'browse' ? `Mỗi lần tải tối đa ${MAX_BOOTH_SELECTION} ảnh.` : `Khung này còn ${limit} ô trống.`); return }
    setNotice(null)
    setSelected([...selected, id])
  }
  /** Android/desktop: direct downloads. iPhone: share sheet, which needs the files first and a fresh tap. */
  const save = async (items: BoothPhoto[]) => {
    if (!items.length || preparing) return
    if (!useShareSheet) { await downloadBoothPhotos(items); return }
    if (items.every((photo) => readyFiles[photo.id])) { await deliverImageFiles(items.map((photo) => readyFiles[photo.id]!)); return }
    setPreparing(true)
    try {
      const files = await Promise.all(items.map(loadOriginal))
      setReadyFiles((current) => ({ ...current, ...Object.fromEntries(items.map((photo, index) => [photo.id, files[index]!])) }))
    } catch { setNotice('Không tải được ảnh. Vui lòng kiểm tra mạng rồi thử lại.') }
    finally { setPreparing(false) }
  }
  const saveLabel = (items: BoothPhoto[]) => (!useShareSheet ? `⬇ Tải ${items.length} ảnh về máy` : preparing ? 'Đang chuẩn bị ảnh…' : items.length && items.every((photo) => readyFiles[photo.id]) ? `⬇ Lưu ${items.length} ảnh vào máy` : `⬇ Tải ${items.length} ảnh về máy`)
  const subtitle = mode === 'browse'
    ? `${photos.length} ảnh. Chạm để chọn (tối đa ${MAX_BOOTH_SELECTION}) rồi tải về máy, ⤢ để xem lớn. Ảnh được lưu 3 ngày.`
    : limit === 1
      ? (slotNumbers.length ? `Chọn 1 ảnh cho hình ${slotNumbers[0]}.` : 'Chọn 1 ảnh cho khung này.')
      : `Chọn tối đa ${limit} ảnh. Ảnh chọn trước vào hình trước: ${slotNumbers.map((number) => `hình ${number}`).join(', ')}.`

  return <div aria-labelledby="booth-pool-title" aria-modal="true" className="fixed inset-0 z-[80] flex items-end justify-center bg-stone-950/60 sm:items-center" role="dialog">
    <div className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-5 text-stone-950 shadow-2xl sm:rounded-3xl">
      <div className="flex items-center justify-between"><h2 className="text-lg font-black" id="booth-pool-title">Ảnh phòng chụp</h2><button className="min-h-10 rounded-xl px-3 text-sm font-bold text-stone-500" onClick={onClose} type="button">Đóng</button></div>
      <p className="mt-1 text-sm text-stone-500">{subtitle}</p>
      <ul className="mt-3 grid grid-cols-3 gap-2">{photos.map((photo, index) => {
        const isSelected = selected.includes(photo.id)
        const order = selected.indexOf(photo.id)
        const target = mode === 'pick' && order >= 0 ? slotNumbers[order] : undefined
        return <li className="relative" key={photo.id}>
          <button aria-label={`Ảnh ${index + 1}${target ? `, vào hình ${target}` : ''}`} aria-pressed={isSelected} className={`relative block aspect-[2/3] w-full overflow-hidden rounded-xl bg-stone-200 ${isSelected ? 'ring-4 ring-[var(--brand-primary)]' : ''}`} onClick={() => toggle(photo.id)} type="button">
            {photo.thumbUrl ? <img alt="" className="h-full w-full object-cover" decoding="async" loading="lazy" src={photo.thumbUrl} /> : <span className="grid h-full place-items-center text-xs text-stone-500">Ảnh {index + 1}</span>}
            {isSelected ? <span className="absolute inset-x-1.5 bottom-1.5 rounded-lg bg-[var(--brand-primary)] px-2 py-1 text-center text-xs font-black text-white shadow">{target ? `→ Hình ${target}` : '✓ Đã chọn'}</span> : null}
          </button>
          <button aria-label={`Xem lớn ảnh ${index + 1}`} className="absolute right-1.5 top-1.5 grid size-8 place-items-center rounded-full bg-stone-950/55 text-sm font-black text-white shadow" onClick={() => setViewerIndex(index)} type="button">⤢</button>
        </li>
      })}</ul>
      {notice ? <p className="mt-3 rounded-xl bg-amber-50 p-2 text-center text-sm font-bold text-amber-800" role="alert">{notice}</p> : null}
      {mode === 'pick'
        ? <div className="mt-4 grid grid-cols-2 gap-2"><button className="min-h-12 rounded-2xl border-2 border-stone-950 text-sm font-black" onClick={onUsePhone} type="button">Từ điện thoại</button><button className="min-h-12 rounded-2xl bg-stone-950 text-sm font-black text-white disabled:opacity-35" disabled={!selected.length} onClick={() => onConfirm?.(selected)} type="button">{selected.length && slotNumbers.length ? `Thêm vào ${selected.map((_, order) => `hình ${slotNumbers[order]}`).join(', ')}` : `Thêm ${selected.length || ''} ảnh`}</button></div>
        : <button className="mt-4 min-h-12 w-full rounded-2xl bg-stone-950 text-sm font-black text-white disabled:opacity-35" disabled={!chosen.length || preparing} onClick={() => void save(chosen)} type="button">{chosen.length ? saveLabel(chosen) : 'Chọn ảnh để tải về máy'}</button>}
    </div>
    {viewerIndex !== null ? <BoothPhotoViewer downloadLabel={(photo) => saveLabel([photo]).replace('1 ảnh ', '')} index={viewerIndex} onClose={() => setViewerIndex(null)} onDownload={(photo) => void save([photo])} onIndexChange={setViewerIndex} onToggle={toggle} photos={photos} selectedIds={selected} /> : null}
  </div>
}
