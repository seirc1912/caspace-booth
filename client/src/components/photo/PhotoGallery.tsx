import type { PhotoAsset } from '../../types/selfBooth'
import { Icon } from '../ui/Icon'
import { BrandFooter } from '../layout/BrandFooter'

interface PhotoGalleryProps {
  photos: PhotoAsset[]
  selectedIds: string[]
  onCancel: () => void
  onConfirm: () => void
  onAutoFill: () => void
  onRandomFill: () => void
  onToggle: (id: string) => void
}

export function PhotoGallery({ photos, selectedIds, onCancel, onConfirm, onAutoFill, onRandomFill, onToggle }: PhotoGalleryProps) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#f7f5f2] text-stone-950">
      <header className="flex min-h-16 items-center justify-between border-b border-stone-200 bg-white px-3 sm:px-6">
        <button className="grid size-11 place-items-center rounded-full hover:bg-stone-100" onClick={onCancel} type="button"><Icon name="back" /><span className="sr-only">Back</span></button>
        <div className="text-center"><h2 className="font-bold">SelfBooth Photos</h2><p className="text-xs text-stone-500">{selectedIds.length ? `${selectedIds.length} selected` : 'Tap photos to select'}</p></div>
        <button className="min-w-11 text-sm font-semibold text-stone-500" onClick={onCancel} type="button">Cancel</button>
      </header>
      <section aria-label="SelfBooth photo gallery" className="mx-auto grid w-full max-w-5xl flex-1 auto-rows-max grid-cols-3 gap-1.5 overflow-y-auto p-2 sm:grid-cols-4 sm:gap-3 sm:p-4 lg:grid-cols-5">
        {photos.map((photo) => {
          const selectionIndex = selectedIds.indexOf(photo.id)
          return (
            <button aria-pressed={selectionIndex >= 0} className="relative aspect-square overflow-hidden rounded-xl bg-stone-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-950" key={photo.id} onClick={() => onToggle(photo.id)} type="button">
              <img alt={photo.alt} className="h-full w-full object-cover" src={photo.src} />
              {selectionIndex >= 0 ? <span className="absolute inset-0 grid place-items-center bg-stone-950/15 ring-4 ring-inset ring-white"><span className="grid size-8 place-items-center rounded-full bg-stone-950 text-sm font-bold text-white">{selectionIndex + 1}</span></span> : null}
            </button>
          )
        })}
      </section>
      <footer className="border-t border-stone-200 bg-white px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
        <div className="mx-auto grid max-w-lg grid-cols-2 gap-2">
          <button className="min-h-12 rounded-xl bg-stone-100 px-3 font-semibold text-stone-800" onClick={onRandomFill} type="button">Random Fill</button>
          <button className="min-h-12 rounded-xl bg-stone-100 px-3 font-semibold text-stone-800 disabled:opacity-40" disabled={!selectedIds.length} onClick={onAutoFill} type="button">Auto Fill</button>
          <button className="min-h-12 rounded-xl px-3 font-semibold text-stone-500 hover:bg-stone-50" onClick={onCancel} type="button">Cancel</button>
          <button className="min-h-12 rounded-xl bg-[var(--brand-secondary)] px-3 font-semibold text-white disabled:opacity-40" disabled={!selectedIds.length} onClick={onConfirm} type="button">Confirm</button>
        </div>
        <BrandFooter compact />
      </footer>
    </div>
  )
}
