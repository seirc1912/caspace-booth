import { useRef } from 'react'
import type { ChangeEvent } from 'react'
import type { PhotoAsset } from '../../types/selfBooth'
import { Icon } from '../ui/Icon'

interface SourceSheetProps {
  open: boolean
  onCancel: () => void
  onPhonePhotos: (photos: PhotoAsset[]) => void
  onSelfBoothPhotos: () => void
}

export function SourceSheet({ open, onCancel, onPhonePhotos, onSelfBoothPhotos }: SourceSheetProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  if (!open) return null

  const handleFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const photos = Array.from(event.target.files ?? []).map((file, index) => ({
      id: `phone-${file.name}-${file.lastModified}-${index}`,
      src: URL.createObjectURL(file),
      alt: file.name,
      source: 'phone' as const,
    }))
    if (photos.length) onPhonePhotos(photos)
    event.target.value = ''
  }

  return (
    <div className="fixed inset-0 z-40 bg-stone-950/40 backdrop-blur-[2px]" role="presentation">
      <button aria-label="Close image source menu" className="absolute inset-0" onClick={onCancel} type="button" />
      <section aria-label="Choose image source" aria-modal="true" className="absolute inset-x-0 bottom-0 rounded-t-[2rem] bg-white px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 shadow-2xl" role="dialog">
        <div className="mx-auto max-w-lg">
          <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-stone-200" />
          <h2 className="px-2 py-3 text-xl font-bold tracking-tight">Choose Image Source</h2>
          <div className="grid gap-2">
            <button className="flex min-h-16 items-center gap-4 rounded-2xl bg-stone-100 px-4 text-left font-semibold transition hover:bg-stone-200" onClick={onSelfBoothPhotos} type="button">
              <span className="grid size-10 place-items-center rounded-xl bg-white text-[var(--brand-primary)] shadow-sm"><Icon name="camera" /></span>
              <span><span className="block">SelfBooth Photos</span><span className="mt-0.5 block text-xs font-normal text-stone-500">Photos captured in this booth</span></span>
            </button>
            <button className="flex min-h-16 items-center gap-4 rounded-2xl bg-stone-100 px-4 text-left font-semibold transition hover:bg-stone-200" onClick={() => inputRef.current?.click()} type="button">
              <span className="grid size-10 place-items-center rounded-xl bg-white text-[var(--brand-primary)] shadow-sm"><Icon name="phone" /></span>
              <span><span className="block">Phone Gallery</span><span className="mt-0.5 block text-xs font-normal text-stone-500">Choose one or more images</span></span>
            </button>
            <input accept="image/*" className="sr-only" multiple onChange={handleFiles} ref={inputRef} type="file" />
            <button className="min-h-12 rounded-2xl px-4 font-semibold text-stone-500 hover:bg-stone-50" onClick={onCancel} type="button">Cancel</button>
          </div>
        </div>
      </section>
    </div>
  )
}
