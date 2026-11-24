import { useState } from 'react'
import { AppHeader } from '../components/chrome/AppHeader'
import { BottomBar } from '../components/chrome/BottomBar'
import { Button } from '../components/chrome/Button'
import { PhoneInput, type PhoneInputState } from '../components/chrome/PhoneInput'
import { formatPhoneDisplay, formatPhoneNumberForDisplay } from '../features/orders/phoneDisplay'
import { Stepper } from '../components/chrome/Stepper'
import { ToolLinkCard } from '../components/chrome/ToolLinkCard'
import { PageShell } from '../components/layout/PageShell'
import { Icon } from '../components/ui/Icon'
import { customerRoutes } from '../config/routes'
import { useBranding } from '../contexts/BrandingContext'
import { isValidPhoneNumber, normalizePhoneNumber } from '../features/orders/phoneNumber'

/** Vietnamese mobile numbers have 10 digits; the helper counts down to it. */
const expectedDigits = 10

export function HomePage({ phoneNumber, onContinue }: { phoneNumber: string; onContinue: (phoneNumber: string) => void }) {
  const [phone, setPhone] = useState(() => formatPhoneDisplay(phoneNumber))
  const [touched, setTouched] = useState(false)
  const branding = useBranding()
  const valid = isValidPhoneNumber(phone)
  const digits = normalizePhoneNumber(phone).replace(/\D/g, '').length
  const malformed = phone.length > 0 && !valid && (digits >= expectedDigits || /[^\d\s+().-]/.test(phone))
  const state: PhoneInputState = valid ? 'valid' : (touched && phone.length > 0) || malformed ? 'error' : phone.length ? 'typing' : 'empty'
  const submit = () => { setTouched(true); if (valid) onContinue(normalizePhoneNumber(phone)) }
  const helper = state === 'error' ? 'Số điện thoại chưa đúng. Kiểm tra lại số bạn đã đặt lịch.' : state === 'typing' ? `Còn thiếu ${Math.max(1, expectedDigits - digits)} số.` : 'Chỉ dùng để tìm ảnh của bạn cho đơn in này.'
  const buttonLabel = valid ? (branding.continueButtonText || 'Tiếp tục') : state === 'error' ? 'Kiểm tra lại số' : 'Nhập đủ 10 số để tiếp tục'

  return <PageShell bottomBar={<BottomBar><Button className="w-full" disabled={!valid} onClick={submit} style={valid && branding.buttonColor ? { backgroundColor: branding.buttonColor, backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,.16), rgba(0,0,0,.25))' } : undefined} trailingIcon={<Icon name="arrowRight" />}>{buttonLabel}</Button></BottomBar>}>
    <AppHeader variant="home" />
    <div className="mt-3"><Stepper step={1} /></div>
    <section className="cs-panel mt-5 rounded-[28px] px-5 pb-5 pt-6" style={{ ...(branding.cardBackground ? { backgroundColor: branding.cardBackground, backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,.55) 0%, rgba(0,0,0,.07) 100%)' } : {}), color: branding.textColor || undefined }}>
      <p className="cs-mono text-[11px] text-cs-red-text">In ảnh tại studio</p>
      <h1 className="mt-2 break-words text-[28px] font-black leading-[1.08] tracking-[-0.035em]">{branding.homeHeadline || 'Nhập số điện thoại để in ảnh'}</h1>
      {branding.homeDescription ? <p className="mt-3 break-words text-[15px] leading-normal opacity-80">{branding.homeDescription}</p> : null}
      <label className="mt-5 block text-[15px] font-bold" htmlFor="customer-phone">{branding.phoneLabel || 'Số điện thoại'}</label>
      <div className="mt-2"><PhoneInput describedBy="phone-help" id="customer-phone" onChange={(value) => { setPhone(value); setTouched(false) }} onEnter={submit} placeholder={branding.phonePlaceholder || '0909 000 000'} state={state} value={phone} /></div>
      <p className={`mt-2 flex gap-1.5 text-[13px] leading-snug ${state === 'error' ? 'font-semibold text-cs-red-text' : 'text-cs-ink-3'}`} id="phone-help">{state === 'error' ? <Icon className="mt-px size-4 shrink-0" name="alert" /> : null}<span aria-live="polite">{helper}</span></p>
    </section>
    <h2 className="cs-mono mt-7 text-[11px] text-cs-ink-2">Công cụ khác</h2>
    <div className="mt-2 grid grid-cols-2 gap-2.5">
      <ToolLinkCard description="Màu film cho ảnh" href={customerRoutes.colorLab} icon="contrast" title="Cá Color Lab" />
      <ToolLinkCard description="Gửi ảnh gốc để in" href={customerRoutes.photoUpload} icon="upload" title="Upload ảnh" />
    </div>
    {branding.address || branding.phone ? <p className="mt-5 flex flex-wrap justify-between gap-x-4 gap-y-1 font-mono text-[11px] font-medium text-cs-ink-2"><span>{branding.address}</span>{branding.phone ? <a className="underline-offset-2 hover:underline" href={`tel:${branding.phone.replace(/\s/g, '')}`}>{formatPhoneNumberForDisplay(branding.phone)}</a> : null}</p> : null}
  </PageShell>
}
