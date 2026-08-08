import { useState } from 'react'
import { BrandMark } from '../components/branding/BrandMark'
import { PageShell } from '../components/layout/PageShell'
import { PrimaryButton } from '../components/ui/PrimaryButton'
import { isValidPhoneNumber, normalizePhoneNumber } from '../features/orders/phoneNumber'
import { useBranding } from '../contexts/BrandingContext'

export function HomePage({ phoneNumber, onContinue }: { phoneNumber: string; onContinue: (phoneNumber: string) => void }) {
  const [phone, setPhone] = useState(phoneNumber)
  const branding = useBranding()
  const [touched, setTouched] = useState(false)
  const valid = isValidPhoneNumber(phone)
  const submit = () => { setTouched(true); if (valid) onContinue(normalizePhoneNumber(phone)) }
  return <PageShell><header className="flex items-center justify-between"><BrandMark />{branding.badgeText ? <span className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-stone-500 shadow-sm">{branding.badgeText}</span> : null}</header><section className="mx-auto grid flex-1 place-items-center py-12"><div className="w-full max-w-lg rounded-[2rem] p-6 shadow-sm sm:p-10" style={{ backgroundColor: branding.cardBackground }}><p className="text-sm font-bold uppercase tracking-[0.22em] text-[var(--brand-primary)]">{branding.homeStepLabel}</p><h1 className="mt-3 text-4xl font-black tracking-[-0.045em]">{branding.homeHeadline}</h1><p className="mt-4 leading-7 text-stone-500">{branding.homeDescription}</p><label className="mt-8 block text-sm font-bold" htmlFor="customer-phone">{branding.phoneLabel}</label><input aria-describedby="phone-help" aria-invalid={touched && !valid} autoComplete="tel" className={`mt-2 min-h-16 w-full rounded-2xl border bg-stone-50 px-5 text-xl font-bold outline-none transition focus:ring-4 ${touched && !valid ? 'border-rose-400 focus:ring-rose-100' : 'border-stone-200 focus:border-stone-950 focus:ring-stone-100'}`} id="customer-phone" inputMode="tel" onChange={(event) => setPhone(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') submit() }} placeholder={branding.phonePlaceholder} type="tel" value={phone} /><p className={`mt-2 text-sm ${touched && !valid ? 'font-semibold text-rose-600' : 'text-stone-400'}`} id="phone-help">{touched && !valid ? 'Enter a valid phone number with 9–15 digits.' : branding.phoneHelper}</p><PrimaryButton className="mt-7 w-full" disabled={!valid} onClick={submit} style={{ backgroundColor: branding.buttonColor }}>{branding.continueButtonText}</PrimaryButton></div></section></PageShell>
}
