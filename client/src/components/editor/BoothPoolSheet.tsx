import { useState } from 'react'
import { BoothPhotoViewer } from '../booth/BoothPhotoViewer'
import { downloadBoothPhotos, MAX_BOOTH_SELECTION, prefersShareSheet, type BoothPhoto } from '../../features/boothPhotos/boothPhotosClient'
import { deliverImageFiles } from '../../features/orders/services/saveComposition'
import { BottomSheet } from '../chrome/BottomSheet'
import { Button } from '../chrome/Button'
import { Icon } from '../ui/Icon'

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
  // iPhone: the share sheet only opens straight from a tap, so fetch originals as soon as a photo is
  // chosen; by the time the customer taps "Lưu" the files are ready and one tap is enough.
  const prefetch = (id: string) => {
    if (!useShareSheet || mode !== 'browse' || readyFiles[id]) return
    const photo = photos.find((item) => item.id === id)
    if (photo) void loadOriginal(photo).then((file) => setReadyFiles((current) => current[id] ? current : { ...current, [id]: file })).catch(() => undefined)
  }
  const openViewer = (index: number) => { setViewerIndex(index); const photo = photos[index]; if (photo) prefetch(photo.id) }
  const toggle = (id: string) => {
    if (selected.includes(id)) { setSelected(selected.filter((item) => item !== id)); return }
    if (limit === 1) { setSelected([id]); return }
    if (selected.length >= limit) { setNotice(mode === 'browse' ? `Mỗi lần tải tối đa ${MAX_BOOTH_SELECTION} ảnh.` : `Khung này còn ${limit} ô trống.`); return }
    setNotice(null)
    setSelected([...selected, id])
    prefetch(id)
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
  const saveLabel = (items: BoothPhoto[]) => (!useShareSheet ? `Tải ${items.length} ảnh về máy` : items.length && items.every((photo) => readyFiles[photo.id]) ? `Lưu ${items.length} ảnh vào máy` : 'Đang chuẩn bị ảnh…')
  const subtitle = mode === 'browse'
    ? `${photos.length} ảnh. Chạm để chọn (tối đa ${MAX_BOOTH_SELECTION}) rồi tải về máy, chạm nút phóng ở góc ảnh để xem lớn. Ảnh được lưu 3 ngày.`
    : limit === 1
      ? (slotNumbers.length ? `Chọn 1 ảnh cho hình ${slotNumbers[0]}.` : 'Chọn 1 ảnh cho khung này.')
      : `Chọn tối đa ${limit} ảnh. Ảnh chọn trước vào hình trước: ${slotNumbers.map((number) => `hình ${number}`).join(', ')}.`

  const footer = mode === 'pick'
    ? <div className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.5fr)] gap-2.5"><Button icon={<Icon className="size-[18px]" name="mobile" />} onClick={onUsePhone} variant="chrome">Từ điện thoại</Button><Button disabled={!selected.length} onClick={() => onConfirm?.(selected)}>{selected.length && slotNumbers.length ? `Thêm vào ${selected.map((_, order) => `hình ${slotNumbers[order]}`).join(', ')}` : selected.length ? `Thêm ${selected.length} ảnh` : 'Chọn ảnh để thêm'}</Button></div>
    : <Button className="w-full" disabled={!chosen.length} icon={<Icon name="download" />} loading={preparing} onClick={() => void save(chosen)}>{chosen.length ? saveLabel(chosen) : 'Chọn ảnh để tải về máy'}</Button>

  return <BottomSheet footer={footer} onClose={onClose} subtitle={subtitle} title="Ảnh phòng chụp">
    <ul className="grid grid-cols-3 gap-2">{photos.map((photo, index) => {
      const isSelected = selected.includes(photo.id)
      const order = selected.indexOf(photo.id)
      const target = mode === 'pick' && order >= 0 ? slotNumbers[order] : undefined
      const full = !isSelected && limit > 1 && selected.length >= limit
      return <li className="relative" key={photo.id}>
        <button aria-label={`Ảnh ${index + 1}${target ? `, vào hình ${target}` : ''}`} aria-pressed={isSelected} className={`relative block aspect-[2/3] w-full overflow-hidden rounded-[14px] bg-cs-graphite transition-opacity ${full ? 'opacity-55' : ''}`} onClick={() => toggle(photo.id)} type="button">
          {photo.thumbUrl ? <img alt="" className="h-full w-full object-cover" decoding="async" loading="lazy" src={photo.thumbUrl} /> : <span className="grid h-full place-items-center text-xs text-white/70">Ảnh {index + 1}</span>}
          {isSelected ? <span aria-hidden="true" className="absolute inset-0 rounded-[14px] border-[3px] border-cs-led" /> : null}
          <span aria-hidden="true" className={`absolute right-1.5 top-1.5 grid size-6 place-items-center rounded-full text-xs font-black ${isSelected ? 'cs-led text-white' : 'border-2 border-white bg-black/20'}`}>{isSelected ? order + 1 : null}</span>
          {target ? <span className="cs-mono absolute inset-x-1.5 bottom-1.5 rounded-lg bg-cs-ink/85 px-1 py-1 text-center text-[10px] text-white">{`Hình ${target}`}</span> : null}
        </button>
        <button aria-label={`Xem lớn ảnh ${index + 1}`} className="absolute bottom-0 right-0 grid size-11 place-items-center" onClick={() => openViewer(index)} type="button"><span className={`grid size-7 place-items-center rounded-full bg-cs-ink/70 text-white ${target ? 'mb-7' : ''}`}><Icon className="size-4" name="expand" /></span></button>
      </li>
    })}</ul>
    {notice ? <p className="mt-3 rounded-[14px] border border-cs-alert-error-border bg-cs-alert-error-bg p-2.5 text-center text-sm font-bold text-cs-alert-error-fg" role="alert">{notice}</p> : null}
    {viewerIndex !== null ? <BoothPhotoViewer downloadLabel={(photo) => saveLabel([photo]).replace('1 ảnh ', '')} index={viewerIndex} onClose={() => setViewerIndex(null)} onDownload={(photo) => void save([photo])} onIndexChange={openViewer} onToggle={toggle} photos={photos} selectedIds={selected} slotNumbers={mode === 'pick' ? slotNumbers : []} /> : null}
  </BottomSheet>
}
