import { useState } from 'react'
import { BrandMark } from '../components/branding/BrandMark'
import { PageShell } from '../components/layout/PageShell'
import { PrimaryButton } from '../components/ui/PrimaryButton'
import { isValidPhoneNumber, normalizePhoneNumber } from '../features/orders/phoneNumber'

export function HomePage({ phoneNumber, onContinue }: { phoneNumber: string; onContinue: (phoneNumber: string) => void }) {
  const [phone, setPhone] = useState(phoneNumber)
  const [touched, setTouched] = useState(false)
  const valid = isValidPhoneNumber(phone)
  const submit = () => { setTouched(true); if (valid) onContinue(normalizePhoneNumber(phone)) }
  return <PageShell><header className="flex items-center justify-between"><BrandMark /><span className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-stone-500 shadow-sm">Private studio session</span></header><section className="mx-auto grid flex-1 place-items-center py-12"><div className="w-full max-w-lg rounded-[2rem] bg-white p-6 shadow-sm sm:p-10"><p className="text-sm font-bold uppercase tracking-[0.22em] text-[var(--brand-primary)]">Step 1 of 6</p><h1 className="mt-3 text-4xl font-black tracking-[-0.045em]">Let’s start with your number.</h1><p className="mt-4 leading-7 text-stone-500">We’ll attach it to this booth order so the studio can identify your session.</p><label className="mt-8 block text-sm font-bold" htmlFor="customer-phone">Phone number</label><input aria-describedby="phone-help" aria-invalid={touched && !valid} autoComplete="tel" className={`mt-2 min-h-16 w-full rounded-2xl border bg-stone-50 px-5 text-xl font-bold outline-none transition focus:ring-4 ${touched && !valid ? 'border-rose-400 focus:ring-rose-100' : 'border-stone-200 focus:border-stone-950 focus:ring-stone-100'}`} id="customer-phone" inputMode="tel" onChange={(event) => setPhone(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') submit() }} placeholder="090 123 4567" type="tel" value={phone} /><p className={`mt-2 text-sm ${touched && !valid ? 'font-semibold text-rose-600' : 'text-stone-400'}`} id="phone-help">{touched && !valid ? 'Enter a valid phone number with 9–15 digits.' : 'Your number is used only for this order.'}</p><PrimaryButton className="mt-7 w-full" disabled={!valid} onClick={submit}>Continue to rooms</PrimaryButton></div></section></PageShell>
}
