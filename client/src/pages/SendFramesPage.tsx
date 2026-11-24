import { useState } from 'react'
import { Alert } from '../components/chrome/Alert'
import { AppHeader } from '../components/chrome/AppHeader'
import { BottomBar } from '../components/chrome/BottomBar'
import { Button } from '../components/chrome/Button'
import { buttonClass } from '../components/chrome/buttonClass'
import { formatPhoneDisplay } from '../features/orders/phoneDisplay'
import { socialLinks } from '../features/branding/socialLinks'
import { Stepper } from '../components/chrome/Stepper'
import { frameCode } from '../components/editor/frameCode'
import { PageShell } from '../components/layout/PageShell'
import { Icon } from '../components/ui/Icon'
import { useBranding } from '../contexts/BrandingContext'
import type { FrameSendState } from '../features/orders/services/sendFrames'

export interface SendFrameRow { templateId: string; frameNumber: number; name: string; thumbnailUrl: string | null; slotCount: number; filledCount: number; filled: boolean; sent: boolean; state?: FrameSendState; progress?: number }

interface SendFramesPageProps {
  rows: SendFrameRow[]
  phone: string
  roomName: string
  sending: boolean
  /** Partial failure / error text after a send. */
  message: string | null
  /** Number of frames sent when the last send fully succeeded. */
  sentCount: number | null
  onSend: (templateIds: string[]) => void
  onBack: () => void
  onContinueFrame: (frameNumber: number) => void
  onHome: () => void
  /** Back to the room list to pick another room. */
  onRooms: () => void
}

const stateLabel: Record<FrameSendState, string> = { waiting: 'Đang chờ', rendering: 'Đang tạo ảnh…', uploading: 'Đang gửi', sent: 'Đã gửi', failed: 'Lỗi · thử gửi lại' }

/** Step 4 · Gửi in: tick finished frames and send them to the print counter in one tap. */
export function SendFramesPage({ rows, phone, roomName, sending, message, sentCount, onSend, onBack, onContinueFrame, onHome, onRooms }: SendFramesPageProps) {
  const branding = useBranding()
  const [ticked, setTicked] = useState<string[]>(() => rows.filter((row) => row.filled && !row.sent).map((row) => row.templateId))
  const toggle = (id: string) => setTicked((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
  const chosen = ticked.filter((id) => rows.some((row) => row.templateId === id && row.filled))
  const count = chosen.length

  if (sentCount !== null && !sending) {
    const socials = socialLinks(branding)
    return <PageShell>
      <AppHeader variant="center" />
      <section aria-live="polite" className="flex flex-1 flex-col items-center justify-center py-10 text-center">
        <span className="cs-panel grid size-28 place-items-center rounded-full"><span className="cs-lcd grid size-16 place-items-center rounded-full text-cs-led-green"><Icon className="size-7" name="check" /></span></span>
        <h1 className="mt-6 text-[28px] font-black tracking-[-0.035em]">Đã gửi {sentCount} khung</h1>
        <p className="mt-2 max-w-[20rem] text-[15px] leading-normal text-cs-ink-2">Báo số <strong className="whitespace-nowrap">{formatPhoneDisplay(phone)}</strong> tại quầy để nhận ảnh in.</p>
        {socials.length ? <div className="mt-6 w-full"><p className="cs-mono text-[11px] text-cs-ink-2">Theo dõi Cá Space</p><ul className="mt-2 flex flex-wrap justify-center gap-2">{socials.map((item) => <li key={item.label}><a className={buttonClass('chrome', { className: 'min-h-11 rounded-full px-4' })} href={item.href} rel="noopener noreferrer" target="_blank"><Icon className="size-[18px]" name={item.icon} />{item.label}</a></li>)}</ul></div> : null}
        <div className="mt-8 grid w-full gap-2.5"><Button onClick={onBack} variant="chrome">Ghép thêm khung</Button><Button onClick={onRooms} variant="chrome">Chọn phòng khác</Button><Button onClick={onHome}>Về trang chủ</Button></div>
      </section>
    </PageShell>
  }

  return <PageShell bottomBar={<BottomBar><Button className="w-full" disabled={!count} loading={sending} onClick={() => onSend(chosen)} trailingIcon={<Icon name="send" />} variant="send">{sending ? 'Đang gửi…' : count ? `Gửi ${count} khung cho quầy in` : 'Chọn khung để gửi'}</Button></BottomBar>}>
    <AppHeader backLabel="Quay lại ghép khung" onBack={onBack} step={4} variant="flow" />
    <div className="mt-3"><Stepper step={4} /></div>
    <h1 className="mt-6 text-[28px] font-black leading-tight tracking-[-0.035em]">Gửi khung cho quầy in</h1>
    <p className="mt-1 text-[15px] leading-normal text-cs-ink-2">Chọn các khung đã ghép xong. Khung còn ô trống chưa gửi được.</p>
    {message ? <Alert className="mt-4" kind="error" title="Chưa gửi xong">{message}</Alert> : null}
    <ul aria-label="Khung của phòng" className="mt-4 grid gap-2.5">{rows.map((row) => {
      const checked = chosen.includes(row.templateId)
      const missing = Math.max(0, row.slotCount - row.filledCount)
      const status = row.state ? `${stateLabel[row.state]}${row.state === 'uploading' && row.progress !== undefined ? ` ${row.progress}%` : ''}` : row.sent ? 'Đã gửi · có thể gửi lại' : `Đủ ${row.filledCount}/${row.slotCount} ảnh · sẵn sàng`
      const thumb = <span className="grid h-[72px] w-12 shrink-0 place-items-center overflow-hidden rounded-[10px] bg-cs-chrome-200">{row.thumbnailUrl ? <img alt="" className="h-full w-full object-contain" decoding="async" loading="lazy" src={row.thumbnailUrl} /> : <Icon className="size-5 text-cs-ink-3" name="image" />}</span>
      const title = <span className="block min-w-0"><span className="cs-mono block text-[10px] text-cs-ink-3">{frameCode(row.frameNumber - 1)}</span><span className="block truncate text-base font-extrabold">{row.name}</span></span>
      if (!row.filled) return <li className="cs-panel flex items-center gap-3 rounded-[20px] p-2.5" key={row.templateId}>{thumb}<span className="min-w-0 flex-1">{title}<span className="mt-0.5 block text-[13px] font-semibold text-cs-red-text">Còn thiếu {missing} ảnh</span></span><button className={buttonClass('chrome', { className: 'min-h-11 shrink-0 rounded-[14px] px-3.5' })} disabled={sending} onClick={() => onContinueFrame(row.frameNumber)} type="button">Ghép tiếp</button></li>
      return <li key={row.templateId}><label className={`cs-panel flex cursor-pointer items-center gap-3 rounded-[20px] p-2.5 ${checked ? 'ring-2 ring-cs-ink' : ''} ${sending ? 'cursor-progress' : ''}`}>
        {thumb}
        <span className="min-w-0 flex-1">{title}<span className={`mt-0.5 block text-[13px] font-semibold ${row.state === 'failed' ? 'text-cs-red-text' : 'text-cs-green-text'}`}>{status}</span></span>
        <input checked={checked} className="peer sr-only" disabled={sending} onChange={() => toggle(row.templateId)} type="checkbox" />
        <span aria-hidden="true" className={`mr-1.5 grid size-8 shrink-0 place-items-center rounded-[10px] border-2 peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-cs-ink ${checked ? 'border-cs-ink bg-cs-ink text-white' : 'border-cs-chrome-600 bg-white'}`}>{checked ? <Icon className="size-4" name="check" /> : null}</span>
      </label></li>
    })}</ul>
    <section aria-labelledby="order-summary" className="cs-lcd mt-4 rounded-[20px] px-4 py-3.5 text-[15px]"><h2 className="cs-mono text-[11px] text-white/70" id="order-summary">Đơn in</h2><dl className="mt-1.5 grid gap-1.5">
      <div className="flex justify-between gap-4"><dt className="text-white/80">Số điện thoại</dt><dd className="font-bold">{formatPhoneDisplay(phone)}</dd></div>
      <div className="flex justify-between gap-4"><dt className="shrink-0 text-white/80">Phòng</dt><dd className="truncate text-right font-bold">{roomName}</dd></div>
      <div className="flex justify-between gap-4"><dt className="text-white/80">Số khung gửi</dt><dd className="font-bold">{count}</dd></div>
    </dl></section>
    <Button className="mt-3 w-full" disabled={sending} icon={<Icon name="back" />} onClick={onRooms} variant="chrome">Chọn phòng khác</Button>
  </PageShell>
}
