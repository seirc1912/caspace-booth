import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, DragEvent } from 'react'
import type { PhotoAsset } from '../../types/selfBooth'

interface PhotoLibraryDockProps {
  photos: PhotoAsset[]
  usage: Record<string, number>
  activePhotoId: string | null
  onAdd: (files: File[]) => void
  onSelect: (photo: PhotoAsset) => void
  onDelete: (photoId: string) => void
  onReplace: (photoId: string, file: File) => void
  onImageError: (message: string) => void
}

const isRenderablePhoto = (photo: PhotoAsset | null | undefined): photo is PhotoAsset => Boolean(photo && typeof photo.id === 'string' && typeof photo.src === 'string' && photo.src.length)

export function PhotoLibraryDock({ photos, usage, activePhotoId, onAdd, onSelect, onDelete, onReplace, onImageError }: PhotoLibraryDockProps) {
  const addInput = useRef<HTMLInputElement>(null)
  const replaceInput = useRef<HTMLInputElement>(null)
  const [selected, setSelected] = useState<PhotoAsset | null>(null)
  const selectedPhoto = selected ? photos.find((photo) => photo.id === selected.id) ?? null : null
  useEffect(() => {
    if (!selectedPhoto) return
    const previousOverflow = document.body.style.overflow
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setSelected(null) }
    document.body.style.overflow = 'hidden'; window.addEventListener('keydown', close)
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener('keydown', close) }
  }, [selectedPhoto])

  const add = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) onAdd(Array.from(event.target.files))
    event.target.value = ''
  }
  const replace = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file && selectedPhoto) onReplace(selectedPhoto.id, file)
    event.target.value = ''
    setSelected(null)
  }
  const beginDrag = (event: DragEvent, photoId: string) => {
    event.dataTransfer.effectAllowed = 'copy'
    event.dataTransfer.setData('application/x-selfbooth-photo', photoId)
  }

  return <section aria-label="Photo library" className="border-t border-stone-200 bg-white px-3 py-2 shadow-[0_-12px_30px_rgba(28,25,23,0.08)] md:static md:rounded-[1.5rem] md:border md:bg-white/95 md:p-4 md:shadow-sm md:backdrop-blur-xl">
    <div className="mx-auto max-w-4xl">
      <div className="mb-2 flex items-center justify-between gap-3"><div><h2 className="text-sm font-bold">Photo Library</h2><p className="text-[11px] text-stone-500">Select a photo, then tap any frame</p></div><button className="min-h-11 shrink-0 rounded-xl bg-stone-950 px-4 text-xs font-bold text-white disabled:opacity-40" onClick={() => addInput.current?.click()} type="button">{photos.length ? 'Upload More' : 'Upload Photos'}</button></div>
      <input accept="image/*" className="sr-only" multiple onChange={add} ref={addInput} type="file" />
      <input accept="image/*" className="sr-only" onChange={replace} ref={replaceInput} type="file" />
      {photos.some(isRenderablePhoto) ? <div className="flex snap-x touch-pan-x gap-2 overflow-x-auto overscroll-x-contain pb-1 [-webkit-overflow-scrolling:touch] [scrollbar-width:none]">{photos.filter(isRenderablePhoto).map((photo) => {
        const count = usage[photo.id] ?? 0
        return <article className="relative w-[4.75rem] shrink-0 snap-start" draggable key={photo.id} onDragStart={(event) => beginDrag(event, photo.id)}>
          <button aria-label={`Select ${photo.alt}`} aria-pressed={activePhotoId === photo.id} className={`relative block aspect-square w-full overflow-hidden rounded-xl bg-stone-100 ring-offset-2 transition ${activePhotoId === photo.id ? 'ring-4 ring-[var(--brand-primary)]' : 'focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]'}`} onClick={() => onSelect(photo)} type="button"><img alt={photo.alt} className="h-full w-full object-cover" decoding="async" loading="lazy" onError={() => onImageError(`${photo.alt || 'This image'} could not be displayed.`)} src={photo.previewSrc ?? photo.src} />{count ? <span className="absolute right-1 top-1 grid min-w-6 place-items-center rounded-full bg-emerald-500 px-1.5 py-1 text-[10px] font-black text-white shadow">{count === 1 ? '✓' : count}</span> : <span className="absolute inset-x-1 bottom-1 rounded-full bg-white/90 py-0.5 text-[9px] font-bold text-stone-600">Unused</span>}</button><button aria-label={`Delete ${photo.alt}`} className="absolute left-1 top-1 grid size-8 place-items-center rounded-full bg-stone-950/80 text-base font-bold text-white shadow" onClick={() => onDelete(photo.id)} type="button">×</button>
          <button aria-label={`Photo options for ${photo.alt}`} className="mt-1 min-h-7 w-full rounded-lg text-[10px] font-semibold text-stone-500" onClick={() => setSelected(photo)} type="button">Preview · Edit</button>
        </article>
      })}</div> : <button className="grid min-h-20 w-full place-items-center rounded-2xl border-2 border-dashed border-sky-200 bg-sky-50/60 text-sm font-bold text-sky-700" onClick={() => addInput.current?.click()} type="button">Upload photos once, then reuse them</button>}
    </div>
    {selectedPhoto ? <div className="fixed inset-0 z-50 flex items-end bg-stone-950/45 p-0 backdrop-blur-[2px] sm:items-center sm:justify-center sm:p-6" role="dialog" aria-modal="true" aria-label="Photo options"><button aria-label="Close photo options" className="absolute inset-0" onClick={() => setSelected(null)} type="button" /><div className="relative w-full rounded-t-[2rem] bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl sm:max-w-md sm:rounded-[2rem]"><div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-stone-200" /><img alt={selectedPhoto.alt} className="max-h-[55dvh] w-full rounded-2xl bg-[linear-gradient(45deg,#eee_25%,transparent_25%),linear-gradient(-45deg,#eee_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#eee_75%),linear-gradient(-45deg,transparent_75%,#eee_75%)] bg-[length:20px_20px] object-contain" onError={() => onImageError(`${selectedPhoto.alt || 'This image'} could not be displayed.`)} src={selectedPhoto.previewSrc ?? selectedPhoto.src} /><div className="mt-3 grid grid-cols-2 gap-2"><button className="min-h-12 rounded-xl bg-stone-100 font-bold" onClick={() => replaceInput.current?.click()} type="button">Replace</button><button className="min-h-12 rounded-xl bg-rose-50 font-bold text-rose-600" onClick={() => { onDelete(selectedPhoto.id); setSelected(null) }} type="button">Delete</button><button className="col-span-2 min-h-12 rounded-xl font-bold text-stone-500" onClick={() => setSelected(null)} type="button">Done</button></div></div></div> : null}
  </section>
}
