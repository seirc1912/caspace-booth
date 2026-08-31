import { BrandMark } from '../components/branding/BrandMark'
import { PageShell } from '../components/layout/PageShell'
import { StepHeader } from '../components/layout/StepHeader'
import type { Room } from '../models/Room'

interface RoomSelectionPageProps {
  rooms: Room[]
  templateCount: (roomId: string) => number
  onBack: () => void
  onSelect: (roomId: string) => void
  loading?: boolean
  error?: string | null
}

export function RoomSelectionPage({ rooms, templateCount, onBack, onSelect, loading = false, error = null }: RoomSelectionPageProps) {
  const status = loading
    ? <div className="rounded-[1.75rem] border border-stone-200 bg-white p-12 text-center font-semibold text-stone-500" role="status">Loading rooms…</div>
    : error
      ? <div className="rounded-[1.75rem] border border-rose-200 bg-rose-50 p-12 text-center font-semibold text-rose-700" role="alert">Unable to load rooms. Please try again.</div>
      : <div className="rounded-[1.75rem] border border-dashed border-stone-300 bg-white p-12 text-center text-stone-500">No rooms available.</div>

  return <PageShell><div className="flex items-center justify-between pb-8"><button className="min-h-11 rounded-full bg-white px-4 text-sm font-semibold shadow-sm" onClick={onBack} type="button">← Back</button><BrandMark compact /></div><StepHeader description="Each room has its own mood, colors, and print collection." eyebrow="Step 2 of 6" title="Choose your room" />{rooms.length && !loading && !error ? <section aria-label="Available rooms" className="grid w-full touch-pan-y grid-cols-2 gap-3 pb-12 sm:gap-4 lg:grid-cols-3">{rooms.map((room) => <button className="group relative aspect-square overflow-hidden rounded-2xl border border-stone-200 bg-white text-left shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-950 sm:aspect-auto sm:rounded-[1.75rem]" key={room.id} onClick={() => onSelect(room.id)} type="button"><span className="absolute inset-0 grid place-items-center overflow-hidden bg-gradient-to-br from-rose-100 via-stone-100 to-violet-100 sm:relative sm:aspect-[16/10]">{room.cover ? <img alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" src={room.cover} /> : <span className="text-5xl font-black text-stone-300">{room.name.slice(0, 1)}</span>}<span className="absolute right-2 top-2 rounded-full bg-white/90 px-2 py-1 text-[10px] font-bold backdrop-blur sm:bottom-3 sm:right-3 sm:top-auto sm:px-3 sm:text-xs">{templateCount(room.id)} templates</span><span className="absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-stone-950/80 to-transparent sm:hidden" /></span><span className="absolute inset-x-0 bottom-0 block p-3 text-white sm:static sm:p-5 sm:text-stone-950"><span className="block line-clamp-2 text-sm font-black leading-tight tracking-tight sm:text-xl">{room.name}</span><span className="mt-2 hidden min-h-12 text-sm leading-6 text-stone-500 sm:block">{room.description || 'Discover this room’s print collection.'}</span><span className="mt-2 inline-flex min-h-9 items-center rounded-full bg-white px-3 text-[11px] font-bold text-stone-950 sm:mt-4 sm:min-h-11 sm:bg-stone-950 sm:px-5 sm:text-sm sm:text-white">Enter Room</span></span></button>)}</section> : status}</PageShell>
}
