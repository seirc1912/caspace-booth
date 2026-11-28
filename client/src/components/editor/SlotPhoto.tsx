import { forwardRef, useState } from 'react'
import type { FilledSlot, SlotTransform } from '../../types/selfBooth'
import { slotPhotoStyle } from '../../features/photos/slotPhotoStyle'
import type { Size } from '../../features/photos/slotTransform'

interface SlotPhotoProps {
  slot: FilledSlot
  /** Slot size in template units (only the ratio matters). */
  slotSize: Size
  /** Live transform while editing; defaults to the saved one. */
  transform?: SlotTransform
  className?: string
  loading?: 'eager' | 'lazy'
  onError?: () => void
  /** Natural size of the displayed image (same ratio as the original). */
  onSize?: (size: Size) => void
}

/** A customer photo placed in its slot; hidden until its size is known so it never flashes uncropped. */
export const SlotPhoto = forwardRef<HTMLImageElement, SlotPhotoProps>(function SlotPhoto({ slot, slotSize, transform = slot.transform, className = '', loading = 'eager', onError, onSize }, ref) {
  const src = slot.photo.previewSrc ?? slot.photo.src
  const [size, setSize] = useState<{ src: string; width: number; height: number } | null>(null)
  const known = size?.src === src ? size : null
  return <img alt={slot.photo.alt} className={`pointer-events-none absolute max-w-none select-none ${known ? '' : 'opacity-0'} ${className}`} decoding="async" draggable={false} loading={loading} onError={onError} onLoad={(event) => {
    const { naturalWidth: width, naturalHeight: height } = event.currentTarget
    if (!width || !height) return
    setSize({ src, width, height })
    onSize?.({ width, height })
  }} ref={ref} src={src} style={known ? slotPhotoStyle(transform, known, slotSize) : { inset: 0, width: '100%', height: '100%' }} />
})
