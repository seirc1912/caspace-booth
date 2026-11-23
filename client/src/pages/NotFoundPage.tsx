import { AppHeader } from '../components/chrome/AppHeader'
import { buttonClass } from '../components/chrome/buttonClass'
import { formatPhoneNumberForDisplay } from '../features/orders/phoneDisplay'
import { PageShell } from '../components/layout/PageShell'
import { useBranding } from '../contexts/BrandingContext'

const sprockets = <span aria-hidden="true" className="flex justify-center gap-3">{Array.from({ length: 6 }, (_, index) => <span className="h-2.5 w-4 rounded-[3px] bg-white/20" key={index} />)}</span>

export function NotFoundPage() {
  const branding = useBranding()
  return <PageShell footer={false}>
    <AppHeader variant="center" />
    <section className="flex flex-1 flex-col items-center justify-center py-10 text-center">
      <div className="cs-lcd w-full max-w-[15.5rem] rounded-[24px] px-5 py-4">
        {sprockets}
        <p aria-hidden="true" className="my-2 bg-[linear-gradient(180deg,#FFFFFF_0%,#C9CCD0_38%,#7E838A_50%,#E8E9EB_64%,#A3A7AC_100%)] bg-clip-text text-[88px] font-black leading-none tracking-[-0.04em] text-transparent">404</p>
        {sprockets}
      </div>
      <p className="cs-mono mt-7 text-[11px] text-cs-red-text">Cuộn film này bị lộ sáng</p>
      <h1 className="mt-2 text-[28px] font-black leading-tight tracking-[-0.035em]">Không tìm thấy trang</h1>
      <p className="mt-2 max-w-[19rem] text-[15px] leading-normal text-cs-ink-2">Đường dẫn có thể đã sai hoặc trang không còn nữa.</p>
    </section>
    <div className="grid gap-3 pb-[max(8px,env(safe-area-inset-bottom))]">
      <a className={buttonClass('primary', { className: 'w-full' })} href="/">Về trang chủ {branding.brandName}</a>
      {branding.phone ? <a className="mx-auto inline-flex min-h-11 items-center text-[15px] font-bold underline underline-offset-4" href={`tel:${branding.phone.replace(/\s/g, '')}`}>Cần hỗ trợ? Gọi {formatPhoneNumberForDisplay(branding.phone)}</a> : null}
    </div>
  </PageShell>
}
