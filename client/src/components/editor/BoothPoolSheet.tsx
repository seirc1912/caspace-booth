import { useState } from 'react'
import { BoothPhotoViewer } from '../booth/BoothPhotoViewer'
import { boothPhotoThumb, type BoothPhoto } from '../../features/boothPhotos/boothPhotosClient'
import { BottomSheet } from '../chrome/BottomSheet'
import { Button } from '../chrome/Button'
import { Icon } from '../ui/Icon'

interface BoothPoolSheetProps {
  photos: BoothPhoto[]
  /**
   * pick: "Add Image / Add Photos" — choose photos for the frame (capacity, slotNumbers).
   * browse: header "Ảnh phòng chụp" — view only. Owner decision (24/11/2026): customers do not
   * save booth photos to their phone; after 6 hours staff send a Google Drive link instead.
   */
  mode: 'pick' | 'browse'
  capacity?: number
  /** 1-based slot numbers the chosen photos fill, in order (e.g. [1, 2]); empty for single-photo frames. */
  slotNumbers?: number[]
  /** pick mode: chosen ids in pick order; the editor downloads their originals. */
  onConfirm?: (ids: string[]) => void
  onUsePhone?: () => void
  /** Pick mode outside the editor (Cá Color Lab): own subtitle and confirm label. */
  pickSubtitle?: string
  confirmLabel?: string
  /** Photos already in the frame → their 1-based slot number: shown selected ("Ô 2 ✓") and not picked twice. */
  usedBy?: Record<string, number>
  /** Frame already full: pick one photo, then the slot it replaces (1-based numbers of the frame's slots). */
  replaceSlots?: number[]
  onReplace?: (id: string, slotNumber: number) => void
  onClose: () => void
}

/**
 * Booth photos inside the editor: thumbnails only (instant); the large viewer uses the 1600px
 * preview, and originals are fetched only for the photos actually placed in a frame.
 */
export function BoothPoolSheet({ photos, mode, capacity = 1, slotNumbers = [], onConfirm, onUsePhone, onClose, pickSubtitle, confirmLabel, usedBy = {}, replaceSlots, onReplace }: BoothPoolSheetProps) {
  const browse = mode === 'browse'
  const replacing = !browse && Boolean(replaceSlots?.length && onReplace)
  const limit = replacing ? 1 : capacity
  const hasUsed = Object.keys(usedBy).length > 0
  const [selected, setSelected] = useState<string[]>([])
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const toggle = (id: string) => {
    if (usedBy[id] !== undefined) { setNotice(`Ảnh này đang ở ô ${usedBy[id]}. Chọn ảnh khác.`); return }
    if (selected.includes(id)) { setSelected(selected.filter((item) => item !== id)); return }
    if (limit === 1) { setSelected([id]); return }
    if (selected.length >= limit) { setNotice(`Khung này còn ${limit} ô trống.`); return }
    setNotice(null)
    setSelected([...selected, id])
  }
  const subtitle = browse && !photos.length
    ? 'Chưa có ảnh của số điện thoại này.'
    : browse
    ? `${photos.length} ảnh. Chạm vào ảnh để xem lớn. Ảnh phòng chụp được lưu 6 giờ; sau đó vui lòng liên hệ nhân viên để nhận ảnh qua Google Drive.`
    : pickSubtitle ? pickSubtitle
    : replacing ? 'Khung đã đủ ảnh. Chọn 1 ảnh rồi bấm ô muốn thay.'
    : limit === 1
      ? (slotNumbers.length ? `Chọn 1 ảnh cho hình ${slotNumbers[0]}.` : 'Chọn 1 ảnh cho khung này.')
      : `Chọn tối đa ${limit} ảnh. Ảnh chọn trước vào hình trước: ${slotNumbers.map((number) => `hình ${number}`).join(', ')}.`
  const usedNote = hasUsed ? ' Ảnh viền đỏ đang ở trong khung.' : ''

  const footer = browse
    ? undefined
    : replacing
    ? <div className="grid gap-2"><p className="text-center text-[13px] font-bold text-cs-ink-2">{selected.length ? 'Thay vào ô:' : 'Chọn 1 ảnh để thay'}</p><div className="grid auto-cols-fr grid-flow-col gap-2">{replaceSlots!.map((number) => <Button disabled={!selected.length} key={number} onClick={() => selected[0] && onReplace!(selected[0], number)} variant={selected.length ? 'primary' : 'chrome'}>{`Ô ${number}`}</Button>)}</div></div>
    : <div className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.5fr)] gap-2.5"><Button icon={<Icon className="size-[18px]" name="mobile" />} onClick={onUsePhone} variant="chrome">Từ điện thoại</Button><Button disabled={!selected.length} onClick={() => onConfirm?.(selected)}>{selected.length && confirmLabel ? confirmLabel : selected.length && slotNumbers.length ? `Thêm vào ${selected.map((_, order) => `hình ${slotNumbers[order]}`).join(', ')}` : selected.length ? `Thêm ${selected.length} ảnh` : 'Chọn ảnh để thêm'}</Button></div>

  return <BottomSheet footer={footer} onClose={onClose} subtitle={`${subtitle}${usedNote}`} title="Ảnh phòng chụp">
    {browse && !photos.length ? <p className="rounded-[14px] bg-cs-graphite/5 p-4 text-center text-[15px] leading-normal text-cs-ink-2">Ảnh phòng chụp hiện lên ở đây vài phút sau khi chụp và được lưu 6 giờ. Nếu chưa thấy ảnh hoặc đã quá 6 giờ, vui lòng liên hệ nhân viên để nhận ảnh qua Google Drive.</p> : null}
    <ul className="grid grid-cols-3 gap-2">{photos.map((photo, index) => {
      const isSelected = selected.includes(photo.id)
      const order = selected.indexOf(photo.id)
      const target = order >= 0 ? slotNumbers[order] : undefined
      const full = !isSelected && limit > 1 && selected.length >= limit
      const inSlot = usedBy[photo.id]
      return <li className="relative" key={photo.id}>
        <button aria-label={browse ? `Xem lớn ảnh ${index + 1}${inSlot ? `, đang ở ô ${inSlot}` : ''}` : `Ảnh ${index + 1}${inSlot ? `, đang ở ô ${inSlot}` : target ? `, vào hình ${target}` : ''}`} aria-pressed={browse ? undefined : isSelected} className={`relative block aspect-[2/3] w-full overflow-hidden rounded-[14px] bg-cs-graphite transition-opacity ${full ? 'opacity-55' : ''}`} onClick={() => browse ? setViewerIndex(index) : toggle(photo.id)} type="button">
          {boothPhotoThumb(photo) ? <img alt="" className="h-full w-full object-cover" decoding="async" loading="lazy" src={boothPhotoThumb(photo)} /> : <span className="grid h-full place-items-center text-xs text-white/70">Ảnh {index + 1}</span>}
          {isSelected ? <span aria-hidden="true" className="absolute inset-0 rounded-[14px] border-[3px] border-cs-led" /> : null}
          {inSlot ? <><span aria-hidden="true" className="absolute inset-0 rounded-[14px] border-[3px] border-cs-led bg-cs-led/15" /><span className="cs-led absolute left-1.5 top-1.5 flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-black text-white"><Icon className="size-3" name="check" />{`Ô ${inSlot}`}</span></> : null}
          {browse || inSlot ? null : <span aria-hidden="true" className={`absolute right-1.5 top-1.5 grid size-6 place-items-center rounded-full text-xs font-black ${isSelected ? 'cs-led text-white' : 'border-2 border-white bg-black/20'}`}>{isSelected ? order + 1 : null}</span>}
          {target ? <span className="cs-mono absolute inset-x-1.5 bottom-1.5 rounded-lg bg-cs-ink/85 px-1 py-1 text-center text-[10px] text-white">{`Hình ${target}`}</span> : null}
        </button>
        {browse ? null : <button aria-label={`Xem lớn ảnh ${index + 1}`} className="absolute bottom-0 right-0 grid size-11 place-items-center" onClick={() => setViewerIndex(index)} type="button"><span className={`grid size-7 place-items-center rounded-full bg-cs-ink/70 text-white ${target ? 'mb-7' : ''}`}><Icon className="size-4" name="expand" /></span></button>}
      </li>
    })}</ul>
    {notice ? <p className="mt-3 rounded-[14px] border border-cs-alert-error-border bg-cs-alert-error-bg p-2.5 text-center text-sm font-bold text-cs-alert-error-fg" role="alert">{notice}</p> : null}
    {viewerIndex !== null ? <BoothPhotoViewer index={viewerIndex} onClose={() => setViewerIndex(null)} onIndexChange={setViewerIndex} onToggle={browse ? undefined : toggle} photos={photos} selectedIds={selected} slotNumbers={slotNumbers} /> : null}
  </BottomSheet>
}
