import type { FilledSlot } from '../../types/selfBooth'

interface CustomerPhotoLayerProps {
  slot: FilledSlot
  className?: string
  loading?: 'eager' | 'lazy'
  onError?: () => void
  onLoad?: () => void
}

export function CustomerPhotoLayer({ slot, className = '', loading = 'eager', onError, onLoad }: CustomerPhotoLayerProps) {
  const { transform } = slot
  const cover = slot.fit === 'cover'
  return <div className={`pointer-events-none absolute inset-0 ${className}`} style={{ transform: `translate(${transform.x * 100}%, ${transform.y * 100}%) rotate(${transform.rotation}deg) scale(${transform.flipX ? -transform.zoom : transform.zoom}, ${transform.flipY ? -transform.zoom : transform.zoom})`, transformOrigin: 'center center' }}>
    <img alt={slot.photo.alt} className={`absolute left-1/2 top-1/2 h-auto w-auto -translate-x-1/2 -translate-y-1/2 select-none ${cover ? 'min-h-full min-w-full max-w-none' : 'max-h-full max-w-full'}`} decoding="async" draggable={false} loading={loading} onError={onError} onLoad={onLoad} src={slot.photo.previewSrc ?? slot.photo.src} />
  </div>
}
