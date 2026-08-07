import { useRef } from 'react'
import type { ChangeEvent } from 'react'
import type { PhotoAsset } from '../../types/selfBooth'
import { Icon } from '../ui/Icon'
import { loadPhotoFile } from '../../features/photos/imageLoader'

interface SourceSheetProps {
  open: boolean
  hasPhoto: boolean
  onCancel: () => void
  onRemove: () => void
  onPhonePhotos: (photos: PhotoAsset[]) => void
  onSelfBoothPhotos: () => void
  onError?: (message: string) => void
}

export function SourceSheet({ open, hasPhoto, onCancel, onRemove, onPhonePhotos, onSelfBoothPhotos, onError }: SourceSheetProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  if (!open) return null

  const handleFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const results = await Promise.allSettled(Array.from(event.target.files ?? []).map(loadPhotoFile))
    const photos = results.filter((result): result is PromiseFulfilledResult<PhotoAsset> => result.status === 'fulfilled').map((result) => result.value)
    const failure = results.find((result): result is PromiseRejectedResult => result.status === 'rejected')
    if (photos.length) onPhonePhotos(photos)
    if (failure) onError?.(failure.reason instanceof Error ? failure.reason.message : 'The image could not be loaded.')
    event.target.value = ''
  }

  return (
    <div className="fixed inset-0 z-40 bg-stone-950/40 backdrop-blur-[2px]" role="presentation">
      <button aria-label="Close image source menu" className="absolute inset-0" onClick={onCancel} type="button" />
      <section aria-label="Choose image source" aria-modal="true" className="absolute inset-x-0 bottom-0 rounded-t-[2rem] bg-white px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 shadow-2xl" role="dialog">
        <div className="mx-auto max-w-lg">
          <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-stone-200" />
          <h2 className="px-2 py-3 text-xl font-bold tracking-tight">{hasPhoto ? 'Edit this photo' : 'Add a photo'}</h2>
          <div className="grid gap-2">
            <button className="flex min-h-16 items-center gap-4 rounded-2xl bg-stone-100 px-4 text-left font-semibold transition hover:bg-stone-200" onClick={onSelfBoothPhotos} type="button">
              <span className="grid size-10 place-items-center rounded-xl bg-white text-[var(--brand-primary)] shadow-sm"><Icon name="camera" /></span>
              <span><span className="block">SelfBooth Photos</span><span className="mt-0.5 block text-xs font-normal text-stone-500">Photos captured in this booth</span></span>
            </button>
            <button className="flex min-h-16 items-center gap-4 rounded-2xl bg-stone-100 px-4 text-left font-semibold transition hover:bg-stone-200" onClick={() => inputRef.current?.click()} type="button">
              <span className="grid size-10 place-items-center rounded-xl bg-white text-[var(--brand-primary)] shadow-sm"><Icon name="phone" /></span>
              <span><span className="block">{hasPhoto ? 'Replace Photo' : 'Choose From Phone'}</span><span className="mt-0.5 block text-xs font-normal text-stone-500">Choose one or more original images</span></span>
            </button>
            <input accept="image/*" className="sr-only" multiple onChange={handleFiles} ref={inputRef} type="file" />
            {hasPhoto ? <button className="flex min-h-14 items-center gap-4 rounded-2xl px-4 text-left font-semibold text-rose-600 transition hover:bg-rose-50" onClick={onRemove} type="button"><span className="grid size-10 place-items-center rounded-xl bg-rose-50"><Icon name="trash" /></span>Remove Photo</button> : null}
            <button className="min-h-12 rounded-2xl px-4 font-semibold text-stone-500 hover:bg-stone-50" onClick={onCancel} type="button">Cancel</button>
          </div>
        </div>
      </section>
    </div>
  )
}
