import type { FilledSlot } from '../../types/selfBooth'
import { photoFilterCss } from '../../features/photos/photoFilter'

interface CustomerPhotoLayerProps {
  slot: FilledSlot
  className?: string
  loading?: 'eager' | 'lazy'
  onError?: () => void
  onLoad?: () => void
}

export function CustomerPhotoLayer({ slot, className = '', loading = 'eager', onError, onLoad }: CustomerPhotoLayerProps) {
  const { transform } = slot
  return <div className={`pointer-events-none absolute inset-0 ${className}`} style={{ transform: `translate(${transform.x * 100}%, ${transform.y * 100}%) rotate(${transform.rotation}deg) scale(${transform.flipX ? -transform.zoom : transform.zoom}, ${transform.flipY ? -transform.zoom : transform.zoom})`, transformOrigin: 'center center' }}>
    <img alt={slot.photo.alt} className={`absolute inset-0 h-full w-full max-w-none select-none ${slot.fit === 'cover' ? 'object-cover' : 'object-contain'}`} decoding="async" draggable={false} loading={loading} onError={onError} onLoad={onLoad} src={slot.photo.previewSrc ?? slot.photo.src} style={{ filter: photoFilterCss(slot.filter) }} />
  </div>
}
