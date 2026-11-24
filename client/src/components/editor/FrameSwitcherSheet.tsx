import { BottomSheet } from '../chrome/BottomSheet'
import { Icon } from '../ui/Icon'
import { frameCode } from './frameCode'

export interface EditorFrame { id: string; name: string; slotCount: number; filledCount: number; thumbnailUrl: string | null }

interface FrameSwitcherSheetProps {
  frames: EditorFrame[]
  currentIndex: number
  onSelect: (index: number) => void
  onClose: () => void
}

/** "Khung khác": every frame of the room with its done / in-progress / empty state. */
export function FrameSwitcherSheet({ frames, currentIndex, onSelect, onClose }: FrameSwitcherSheetProps) {
  const done = frames.filter((frame) => frame.slotCount > 0 && frame.filledCount >= frame.slotCount).length
  return <BottomSheet onClose={onClose} subtitle={`Đã ghép xong ${done}/${frames.length} khung. Ảnh đã ghép vẫn được giữ khi đổi khung.`} title="Khung khác">
    <ul aria-label="Khung của phòng" className="grid grid-cols-2 gap-2.5">{frames.map((frame, index) => {
      const current = index === currentIndex
      const full = frame.slotCount > 0 && frame.filledCount >= frame.slotCount
      const status = full ? 'Đủ ảnh' : frame.filledCount ? `Đã ghép ${frame.filledCount}/${frame.slotCount} ô` : `Chưa có ảnh · ${frame.slotCount} ô`
      return <li key={frame.id}><button aria-current={current ? 'true' : undefined} aria-label={`${frameCode(index)}, ${current ? 'đang ghép, ' : ''}${status}`} className={`cs-press flex w-full flex-col rounded-[20px] border bg-white/80 p-2 text-left ${current ? 'border-transparent ring-[3px] ring-cs-led' : 'border-cs-chrome-400/70'}`} onClick={() => onSelect(index)} type="button">
        <span className="relative grid aspect-square place-items-center overflow-hidden rounded-[14px] bg-cs-chrome-200">
          {frame.thumbnailUrl ? <img alt="" className="h-full w-full object-contain" decoding="async" loading="lazy" src={frame.thumbnailUrl} /> : <Icon className="size-6 text-cs-ink-3" name="image" />}
          {full ? <span aria-hidden="true" className="absolute right-1.5 top-1.5 grid size-6 place-items-center rounded-full bg-cs-led-green text-cs-ink"><Icon className="size-3.5" name="check" /></span> : null}
        </span>
        <span className="mt-2 truncate text-sm font-extrabold">{frameCode(index)}</span>
        {current ? <span className="cs-mono text-[10px] text-cs-red-text">Đang ghép</span> : null}
        <span className={`text-xs font-semibold ${full ? 'text-cs-green-text' : 'text-cs-ink-3'}`}>{status}</span>
      </button></li>
    })}</ul>
  </BottomSheet>
}
