import { useEffect, useMemo, useState } from 'react'
import type { BoothPoolPhoto } from '../../features/boothPhotos/boothPhotosClient'

interface BoothPoolSheetProps {
  photos: BoothPoolPhoto[]
  capacity: number
  /** 1-based slot numbers the chosen photos fill, in order (e.g. [1, 2]); empty for single-photo frames. */
  slotNumbers: number[]
  /** Chosen pool ids in pick order; the editor waits for their originals if needed. */
  onConfirm: (ids: string[]) => void
  onUsePhone: () => void
  onClose: () => void
}

/** "Add Photo / Add Image" when booth photos were chosen: pick from them, or fall back to the phone. */
export function BoothPoolSheet({ photos, capacity, slotNumbers, onConfirm, onUsePhone, onClose }: BoothPoolSheetProps) {
  const [selected, setSelected] = useState<string[]>([])
  const previews = useMemo(() => photos.map((photo) => (photo.thumbUrl ? { id: photo.id, url: photo.thumbUrl, owned: false } : photo.file ? { id: photo.id, url: URL.createObjectURL(photo.file), owned: true } : { id: photo.id, url: null, owned: false })), [photos])
  useEffect(() => () => previews.forEach((preview) => { if (preview.owned && preview.url) URL.revokeObjectURL(preview.url) }), [previews])
  const toggle = (id: string) => setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : capacity === 1 ? [id] : current.length >= capacity ? current : [...current, id])
  const confirm = () => onConfirm(selected)
  return <div aria-labelledby="booth-pool-title" aria-modal="true" className="fixed inset-0 z-[80] flex items-end justify-center bg-stone-950/60 sm:items-center" role="dialog">
    <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-5 text-stone-950 shadow-2xl sm:rounded-3xl">
      <div className="flex items-center justify-between"><h2 className="text-lg font-black" id="booth-pool-title">Ảnh phòng chụp</h2><button className="min-h-10 rounded-xl px-3 text-sm font-bold text-stone-500" onClick={onClose} type="button">Đóng</button></div>
      <p className="mt-1 text-sm text-stone-500">{capacity === 1
        ? (slotNumbers.length ? `Chọn 1 ảnh cho hình ${slotNumbers[0]}.` : 'Chọn 1 ảnh cho khung này.')
        : `Chọn tối đa ${capacity} ảnh. Ảnh chọn trước vào hình trước: ${slotNumbers.map((number) => `hình ${number}`).join(', ')}.`}</p>
      <ul className="mt-3 grid grid-cols-3 gap-2">{previews.map((preview, index) => {
        const isSelected = selected.includes(preview.id)
        const order = selected.indexOf(preview.id)
        const target = order >= 0 ? slotNumbers[order] : undefined
        return <li key={preview.id}><button aria-label={`Ảnh ${index + 1}${target ? `, vào hình ${target}` : ''}`} aria-pressed={isSelected} className={`relative block aspect-[2/3] w-full overflow-hidden rounded-xl bg-stone-200 ${isSelected ? 'ring-4 ring-[var(--brand-primary)]' : ''}`} onClick={() => toggle(preview.id)} type="button">{preview.url ? <img alt="" className="h-full w-full object-cover" decoding="async" loading="lazy" src={preview.url} /> : <span className="grid h-full place-items-center text-xs text-stone-500">Ảnh {index + 1}</span>}{isSelected ? <span className="absolute inset-x-1.5 bottom-1.5 rounded-lg bg-[var(--brand-primary)] px-2 py-1 text-center text-xs font-black text-white shadow">{target ? `→ Hình ${target}` : '✓ Đã chọn'}</span> : null}</button></li>
      })}</ul>
      <div className="mt-4 grid grid-cols-2 gap-2"><button className="min-h-12 rounded-2xl border-2 border-stone-950 text-sm font-black" onClick={onUsePhone} type="button">Từ điện thoại</button><button className="min-h-12 rounded-2xl bg-stone-950 text-sm font-black text-white disabled:opacity-35" disabled={!selected.length} onClick={confirm} type="button">{selected.length && slotNumbers.length ? `Thêm vào ${selected.map((_, order) => `hình ${slotNumbers[order]}`).join(', ')}` : `Thêm ${selected.length || ''} ảnh`}</button></div>
    </div>
  </div>
}
