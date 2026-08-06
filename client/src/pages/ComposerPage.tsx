import { useState } from 'react'
import type { FilledSlot, ImageTransform, PhotoAsset, PrintTemplate } from '../types/selfBooth'
import { EditorToolbar } from '../components/editor/EditorToolbar'
import { TemplateCanvas } from '../components/editor/TemplateCanvas'
import { PageShell } from '../components/layout/PageShell'
import { PhotoGallery } from '../components/photo/PhotoGallery'
import { SourceSheet } from '../components/photo/SourceSheet'
import { Icon } from '../components/ui/Icon'
import { PhotoManager } from '../components/photo/PhotoManager'

interface ComposerPageProps {
  template: PrintTemplate
  slots: Array<FilledSlot | null>
  currentSlot: number | null
  selectedPhotoIds: string[]
  onBack: () => void
  onClear: () => void
  onFillEmpty: (photos: PhotoAsset[]) => void
  onNext: () => void
  onRandomFill: () => void
  onShuffle: () => void
  onCurrentSlotChange: (index: number | null) => void
  onClearSelectedPhotos: () => void
  onRemove: (index: number) => void
  onReplace: (index: number, photo: PhotoAsset) => void
  onTransform: (index: number, transform: Partial<ImageTransform>) => void
  onToggleSelectedPhoto: (id: string) => void
  uploadedPhotos: PhotoAsset[]
  maximumPhotos: number
  onAddPhotos: (files: File[]) => void
  onAddPhotoAssets: (photos: PhotoAsset[]) => void
  onDeletePhoto: (photoId: string) => void
  onMovePhoto: (photoId: string, direction: -1 | 1) => void
  onReplacePhoto: (photoId: string, file: File) => void
}

export function ComposerPage({ template, slots, currentSlot, selectedPhotoIds, onBack, onClear, onFillEmpty, onNext, onRandomFill, onShuffle, onCurrentSlotChange, onClearSelectedPhotos, onRemove, onReplace, onTransform, onToggleSelectedPhoto, uploadedPhotos, maximumPhotos, onAddPhotos, onAddPhotoAssets, onDeletePhoto, onMovePhoto, onReplacePhoto }: ComposerPageProps) {
  const [sourceOpen, setSourceOpen] = useState(false)
  const [galleryOpen, setGalleryOpen] = useState(false)

  const openSource = (index: number) => {
    onCurrentSlotChange(index)
    setSourceOpen(true)
  }

  const placePhotos = (photos: PhotoAsset[]) => {
    if (currentSlot !== null && photos[0]) {
      onReplace(currentSlot, photos[0])
      onFillEmpty(photos.slice(1))
    } else {
      onFillEmpty(photos)
    }
    setSourceOpen(false)
    setGalleryOpen(false)
    onClearSelectedPhotos()
  }

  const selectedPhotos = selectedPhotoIds
    .map((id) => uploadedPhotos.find((photo) => photo.id === id))
    .filter((photo): photo is PhotoAsset => Boolean(photo))

  const openGallery = () => {
    setGalleryOpen(true)
    setSourceOpen(false)
    onClearSelectedPhotos()
  }

  return (
    <PageShell className="pb-24">
      <header className="mb-5 flex items-center justify-between">
        <button className="grid size-11 place-items-center rounded-full bg-white shadow-sm hover:bg-stone-100" onClick={onBack} type="button"><Icon name="back" /><span className="sr-only">Choose another template</span></button>
        <div className="text-center"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand-primary)]">Step 4 of 6</p><h1 className="font-bold">Add your photos</h1></div>
        <span className="grid size-11 place-items-center rounded-full bg-white text-xs font-bold shadow-sm">{slots.filter(Boolean).length}/{slots.length}</span>
      </header>
      <div className="mx-auto grid w-full max-w-4xl items-start gap-6 md:grid-cols-[minmax(18rem,24rem)_1fr]">
        <TemplateCanvas activeSlot={currentSlot} onActiveSlotChange={onCurrentSlotChange} onAdd={openSource} onRemove={onRemove} onReplace={openSource} onTransform={onTransform} slots={slots} template={template} />
        <aside className="hidden rounded-[1.75rem] bg-white p-6 shadow-sm md:block">
          <p className="text-sm font-semibold text-[var(--brand-primary)]">{template.name}</p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight">Make it yours</h2>
          <p className="mt-3 leading-7 text-stone-500">Tap any empty frame to choose booth photos or images from your phone. Drag to pan. Use the quick controls to zoom or rotate.</p>
          <div className="mt-6 rounded-2xl bg-stone-100 p-4 text-sm text-stone-600"><strong className="text-stone-900">Quick reset</strong><br />Double tap a photo to return it to the original position.</div>
        </aside>
      </div>
      <div className="mx-auto mt-6 w-full max-w-4xl"><PhotoManager maximum={maximumPhotos} onAdd={onAddPhotos} onDelete={onDeletePhoto} onMove={onMovePhoto} onReplace={onReplacePhoto} photos={uploadedPhotos} /></div>
      <EditorToolbar canContinue={slots.every(Boolean)} onAutoFill={() => onFillEmpty(uploadedPhotos)} onClear={() => { onClear(); onCurrentSlotChange(null) }} onNext={onNext} onShuffle={onShuffle} />
      <SourceSheet hasPhoto={currentSlot !== null && Boolean(slots[currentSlot])} open={sourceOpen && !galleryOpen} onCancel={() => setSourceOpen(false)} onPhonePhotos={(photos) => { onAddPhotoAssets(photos); placePhotos(photos) }} onRemove={() => { if (currentSlot !== null) onRemove(currentSlot); setSourceOpen(false); onCurrentSlotChange(null) }} onSelfBoothPhotos={openGallery} />
      {galleryOpen ? (
        <PhotoGallery
          onAutoFill={() => placePhotos(selectedPhotos)}
          onCancel={() => { setGalleryOpen(false); setSourceOpen(false); onClearSelectedPhotos() }}
          onConfirm={() => placePhotos(selectedPhotos)}
          onRandomFill={() => { onRandomFill(); setGalleryOpen(false); onClearSelectedPhotos() }}
          onToggle={onToggleSelectedPhoto}
          photos={uploadedPhotos}
          selectedIds={selectedPhotoIds}
        />
      ) : null}
    </PageShell>
  )
}
