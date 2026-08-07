import { useRef, useState } from 'react'
import type { ChangeEvent, DragEvent } from 'react'
import type { PhotoAsset } from '../../types/selfBooth'

interface PhotoManagerProps {
  photos: PhotoAsset[]
  maximum: number
  onAdd: (files: File[]) => void
  onDelete: (photoId: string) => void
  onMove: (photoId: string, direction: -1 | 1) => void
  onReplace: (photoId: string, file: File) => void
}

const acceptedTypes = 'image/*'

export function PhotoManager({ photos, maximum, onAdd, onDelete, onMove, onReplace }: PhotoManagerProps) {
  const addInput = useRef<HTMLInputElement>(null)
  const replaceInput = useRef<HTMLInputElement>(null)
  const [replaceId, setReplaceId] = useState<string | null>(null)
  const [preview, setPreview] = useState<PhotoAsset | null>(null)

  const addFiles = (files: FileList | File[]) => onAdd(Array.from(files).slice(0, Math.max(0, maximum - photos.length)))
  const handleAdd = (event: ChangeEvent<HTMLInputElement>) => { if (event.target.files) addFiles(event.target.files); event.target.value = '' }
  const handleReplace = (event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (replaceId && file) onReplace(replaceId, file); event.target.value = ''; setReplaceId(null) }
  const handleDrop = (event: DragEvent<HTMLDivElement>) => { event.preventDefault(); addFiles(event.dataTransfer.files) }

  return <section aria-label="Uploaded photos" className="rounded-[1.5rem] bg-white p-4 shadow-sm sm:p-5"><div className="flex items-center justify-between gap-3"><div><h2 className="font-bold">Your photos</h2><p className="text-xs text-stone-500">{photos.length} of {maximum} uploaded</p></div><button className="min-h-11 rounded-xl bg-stone-950 px-4 text-sm font-semibold text-white disabled:opacity-40" disabled={photos.length >= maximum} onClick={() => addInput.current?.click()} type="button">Add photos</button></div><input accept={acceptedTypes} className="sr-only" multiple onChange={handleAdd} ref={addInput} type="file" /><input accept={acceptedTypes} className="sr-only" onChange={handleReplace} ref={replaceInput} type="file" /><div className="mt-4 rounded-2xl border-2 border-dashed border-stone-200 p-3" onDragOver={(event) => event.preventDefault()} onDrop={handleDrop}>{photos.length ? <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">{photos.map((photo, index) => <article className="group relative overflow-hidden rounded-xl bg-stone-100" key={photo.id}><button className="aspect-square w-full" onClick={() => setPreview(photo)} type="button"><img alt={photo.alt} className="h-full w-full object-cover" src={photo.previewSrc ?? photo.src} /></button><div className="absolute inset-x-1 bottom-1 grid grid-cols-4 gap-0.5 rounded-lg bg-stone-950/85 p-0.5 text-[10px] text-white opacity-100 backdrop-blur sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"><button aria-label={`Move ${photo.alt} earlier`} disabled={index === 0} onClick={() => onMove(photo.id, -1)} type="button">←</button><button aria-label={`Move ${photo.alt} later`} disabled={index === photos.length - 1} onClick={() => onMove(photo.id, 1)} type="button">→</button><button aria-label={`Replace ${photo.alt}`} onClick={() => { setReplaceId(photo.id); replaceInput.current?.click() }} type="button">↻</button><button aria-label={`Delete ${photo.alt}`} className="text-rose-300" onClick={() => onDelete(photo.id)} type="button">×</button></div></article>)}</div> : <button className="grid min-h-28 w-full place-items-center text-center text-sm font-semibold text-stone-500" onClick={() => addInput.current?.click()} type="button"><span>Drop JPEG, PNG, or supported HEIC files here<br /><span className="font-normal text-stone-400">or tap to choose from your phone</span></span></button>}</div>{preview ? <div className="fixed inset-0 z-50 grid place-items-center bg-stone-950/85 p-5" role="dialog" aria-modal="true" aria-label="Photo preview"><button aria-label="Close preview" className="absolute inset-0" onClick={() => setPreview(null)} type="button" /><img alt={preview.alt} className="relative max-h-[85dvh] max-w-full rounded-2xl object-contain" src={preview.previewSrc ?? preview.src} /></div> : null}</section>
}
