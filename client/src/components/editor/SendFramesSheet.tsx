import { useState } from 'react'
import type { FrameSendState } from '../../features/orders/services/sendFrames'

export interface SendFrameRow { templateId: string; frameNumber: number; name: string; filled: boolean; sent: boolean; state?: FrameSendState; progress?: number }

interface SendFramesSheetProps {
  rows: SendFrameRow[]
  sending: boolean
  message: string | null
  onSend: (templateIds: string[]) => void
  onClose: () => void
}

const stateLabel: Record<FrameSendState, string> = { waiting: 'Đang chờ', rendering: 'Đang tạo ảnh…', uploading: 'Đang gửi', sent: 'Đã gửi', failed: 'Lỗi – thử lại' }

/** Tick several finished frames and send them to the shop in one tap. */
export function SendFramesSheet({ rows, sending, message, onSend, onClose }: SendFramesSheetProps) {
  const [ticked, setTicked] = useState<string[]>(() => rows.filter((row) => row.filled && !row.sent).map((row) => row.templateId))
  const toggle = (id: string) => setTicked((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
  const count = ticked.filter((id) => rows.some((row) => row.templateId === id && row.filled)).length
  return <div aria-labelledby="send-frames-title" aria-modal="true" className="fixed inset-0 z-[80] flex items-end justify-center bg-stone-950/60 sm:items-center" role="dialog">
    <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-5 text-stone-950 shadow-2xl sm:rounded-3xl">
      <div className="flex items-center justify-between"><h2 className="text-lg font-black" id="send-frames-title">Gửi khung cho quán in</h2><button className="min-h-10 rounded-xl px-3 text-sm font-bold text-stone-500 disabled:opacity-40" disabled={sending} onClick={onClose} type="button">Đóng</button></div>
      <p className="mt-1 text-sm text-stone-500">Chọn các khung đã ghép xong. Khung chưa đủ ảnh không gửi được.</p>
      <ul className="mt-3 grid gap-2">{rows.map((row) => {
        const checked = ticked.includes(row.templateId) && row.filled
        return <li key={row.templateId}><label className={`flex min-h-14 items-center gap-3 rounded-2xl border px-3 ${row.filled ? 'border-stone-200' : 'border-dashed border-stone-200 opacity-50'}`}>
          <input checked={checked} className="size-5 accent-stone-950" disabled={!row.filled || sending} onChange={() => toggle(row.templateId)} type="checkbox" />
          <span className="flex-1"><span className="block text-sm font-bold">Frame {row.frameNumber} · {row.name}</span><span className="block text-xs text-stone-500">{row.state ? `${stateLabel[row.state]}${row.state === 'uploading' && row.progress !== undefined ? ` ${row.progress}%` : ''}` : !row.filled ? 'Chưa đủ ảnh' : row.sent ? 'Đã gửi' : 'Sẵn sàng'}</span></span>
        </label></li>
      })}</ul>
      {message ? <p className="mt-3 rounded-2xl bg-stone-100 p-3 text-sm font-semibold" role="status">{message}</p> : null}
      <button className="mt-4 min-h-12 w-full rounded-2xl bg-stone-950 text-sm font-black text-white disabled:opacity-35" disabled={!count || sending} onClick={() => onSend(ticked.filter((id) => rows.some((row) => row.templateId === id && row.filled)))} type="button">{sending ? 'ĐANG GỬI…' : `GỬI ${count} KHUNG CHO QUÁN`}</button>
    </div>
  </div>
}
