import { useState } from 'react'
import { Alert } from '../components/chrome/Alert'
import { AppHeader } from '../components/chrome/AppHeader'
import { Spinner } from '../components/chrome/Button'
import { Stepper } from '../components/chrome/Stepper'
import { PageShell } from '../components/layout/PageShell'
import { displayRoomName, roomCode } from '../features/rooms/displayRoomName'
import type { Room } from '../models/Room'

interface RoomSelectionPageProps {
  rooms: Room[]
  templateCount: (roomId: string) => number
  onBack: () => void
  onSelect: (roomId: string) => Promise<void> | void
  loading?: boolean
  error?: string | null
  /** e.g. a room that could not be opened. */
  notice?: string | null
}

export function RoomSelectionPage({ rooms, templateCount, onBack, onSelect, loading = false, error = null, notice = null }: RoomSelectionPageProps) {
  const [opening, setOpening] = useState<string | null>(null)
  const open = async (roomId: string) => {
    if (opening) return
    setOpening(roomId)
    try { await onSelect(roomId) } finally { setOpening(null) }
  }
  const status = loading
    ? <div aria-busy="true" aria-label="Đang tải phòng…" className="grid grid-cols-2 gap-3" role="status">{Array.from({ length: 4 }, (_, index) => <div className="cs-panel animate-pulse rounded-[20px] p-2" key={index}><div className="aspect-[170/110] rounded-[14px] bg-cs-graphite/80" /><div className="mx-1 mb-1 mt-3 h-4 w-3/4 rounded bg-cs-chrome-400/60" /><div className="mx-1 mb-2 mt-2 h-3 w-1/2 rounded bg-cs-chrome-400/40" /></div>)}<p className="sr-only">Đang tải phòng…</p></div>
    : error
      ? <div className="cs-panel rounded-[20px] p-6 text-center" role="alert"><p className="font-extrabold text-cs-red-text">Không tải được danh sách phòng.</p><p className="mt-1 text-sm text-cs-ink-3">Kiểm tra kết nối mạng rồi thử lại.</p><button className="cs-btn-chrome cs-press mt-4 min-h-11 rounded-[16px] px-5 text-sm font-bold" onClick={() => window.location.reload()} type="button">Tải lại</button></div>
      : <div className="cs-panel rounded-[20px] p-6 text-center"><p className="font-extrabold">Chưa có phòng nào</p><p className="mt-1 text-sm text-cs-ink-3">Vui lòng hỏi nhân viên tại quầy.</p></div>

  return <PageShell>
    <AppHeader onBack={onBack} step={2} variant="flow" />
    <div className="mt-3"><Stepper step={2} /></div>
    <h1 className="mt-6 text-[28px] font-black leading-tight tracking-[-0.035em]">Chọn phòng in</h1>
    <p className="mt-1 text-[15px] leading-normal text-cs-ink-2">Mỗi phòng có phong cách và bộ khung in riêng.</p>
    {notice ? <Alert className="mt-4" kind="error">{notice}</Alert> : null}
    <div className="mt-5">{rooms.length && !loading && !error ? <ul aria-label="Danh sách phòng" className="grid grid-cols-2 gap-3">{rooms.map((room, index) => {
      const name = displayRoomName(room.name)
      const count = templateCount(room.id)
      const busy = opening === room.id
      return <li key={room.id}><button aria-busy={busy || undefined} aria-label={`${name}, ${count} mẫu in`} className="cs-panel cs-press block w-full rounded-[20px] p-2 text-left disabled:opacity-60" disabled={Boolean(opening) && !busy} onClick={() => void open(room.id)} type="button">
        <span className="relative block aspect-[170/110] overflow-hidden rounded-[14px] bg-cs-graphite">
          {room.cover ? <img alt="" className="h-full w-full object-cover" decoding="async" loading={index < 4 ? 'eager' : 'lazy'} src={room.cover} /> : null}
          <span className="cs-mono absolute left-2 top-2 rounded-full bg-cs-ink/85 px-2 py-1 text-[10px] text-white">{roomCode(index)}</span>
          {busy ? <span className="absolute inset-0 grid place-items-center bg-cs-ink/55 text-white"><Spinner className="size-6" /></span> : null}
        </span>
        <span className="block px-1 pb-1 pt-2.5"><span className="block break-words text-[15px] font-extrabold leading-tight">{name}</span><span className="mt-1 block text-[13px] text-cs-ink-3">{count} mẫu in</span></span>
      </button></li>
    })}</ul> : status}</div>
  </PageShell>
}
