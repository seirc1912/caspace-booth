import { BrandMark } from '../components/branding/BrandMark'
import { PageShell } from '../components/layout/PageShell'
import { PrimaryButton } from '../components/ui/PrimaryButton'

export function HomePage({ onStart }: { onStart: () => void }) {
  return <PageShell><header className="flex items-center justify-between"><BrandMark /><span className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-stone-500 shadow-sm">Create your print</span></header><section className="mx-auto grid flex-1 place-items-center py-14 text-center"><div className="max-w-xl"><p className="text-sm font-bold uppercase tracking-[0.22em] text-[var(--brand-primary)]">Cá Space Booth</p><h1 className="mt-4 text-4xl font-black tracking-[-0.045em] sm:text-6xl">Your photos, your perfect print.</h1><p className="mx-auto mt-5 max-w-lg text-base leading-7 text-stone-600 sm:text-lg">Choose a design, add photos from your phone, and compose a print in just a few taps.</p><PrimaryButton className="mt-8 min-w-56" onClick={onStart}>Choose a template</PrimaryButton></div></section></PageShell>
}
