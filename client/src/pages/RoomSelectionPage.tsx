import { BrandMark } from '../components/branding/BrandMark'
import { PageShell } from '../components/layout/PageShell'
import { StepHeader } from '../components/layout/StepHeader'
import type { Room } from '../models/Room'

interface RoomSelectionPageProps {
  rooms: Room[]
  templateCount: (roomId: string) => number
  onBack: () => void
  onSelect: (roomId: string) => void
}

export function RoomSelectionPage({ rooms, templateCount, onBack, onSelect }: RoomSelectionPageProps) {
  return <PageShell><div className="flex items-center justify-between pb-8"><button className="min-h-11 rounded-full bg-white px-4 text-sm font-semibold shadow-sm" onClick={onBack} type="button">← Back</button><BrandMark compact /></div><StepHeader description="Each room has its own mood, colors, and print collection." eyebrow="Step 2 of 6" title="Choose your room" />{rooms.length ? <section aria-label="Available rooms" className="grid w-full touch-pan-y gap-4 pb-12 sm:grid-cols-2 lg:grid-cols-3">{rooms.map((room) => <button className="group overflow-hidden rounded-[1.75rem] border border-stone-200 bg-white text-left shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-950" key={room.id} onClick={() => onSelect(room.id)} type="button"><span className="relative grid aspect-[16/10] place-items-center overflow-hidden bg-gradient-to-br from-rose-100 via-stone-100 to-violet-100">{room.cover ? <img alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" src={room.cover} /> : <span className="text-5xl font-black text-stone-300">{room.name.slice(0, 1)}</span>}<span className="absolute bottom-3 right-3 rounded-full bg-white/90 px-3 py-1 text-xs font-bold backdrop-blur">{templateCount(room.id)} templates</span></span><span className="block p-5"><span className="block text-xl font-black tracking-tight">{room.name}</span><span className="mt-2 block min-h-12 text-sm leading-6 text-stone-500">{room.description || 'Discover this room’s print collection.'}</span><span className="mt-4 inline-flex min-h-11 items-center rounded-full bg-stone-950 px-5 text-sm font-bold text-white">Enter room →</span></span></button>)}</section> : <div className="rounded-[1.75rem] border border-dashed border-stone-300 bg-white p-12 text-center text-stone-500">No rooms available.</div>}</PageShell>
}
