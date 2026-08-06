import { PageShell } from '../components/layout/PageShell'
import { PrimaryButton } from '../components/ui/PrimaryButton'

export function SuccessPage({ orderId, onStartOver }: { orderId: string; onStartOver: () => void }) {
  return <PageShell><section className="mx-auto grid flex-1 place-items-center py-16 text-center"><div className="w-full max-w-lg rounded-[2rem] bg-white p-7 shadow-sm sm:p-10"><div className="mx-auto grid size-16 place-items-center rounded-full bg-emerald-100 text-3xl text-emerald-700">✓</div><p className="mt-6 text-sm font-bold uppercase tracking-[0.2em] text-emerald-700">Print Order Submitted</p><h1 className="mt-3 text-3xl font-black">Thank you!</h1><div className="mt-6 rounded-2xl bg-stone-100 p-5"><p className="text-xs font-semibold uppercase tracking-widest text-stone-500">Order number</p><p className="mt-2 text-4xl font-black tracking-tight">{orderId}</p></div><p className="mt-6 text-stone-600">Please show this number to our staff.</p><PrimaryButton className="mt-8 w-full" onClick={onStartOver}>Create another print</PrimaryButton></div></section></PageShell>
}
