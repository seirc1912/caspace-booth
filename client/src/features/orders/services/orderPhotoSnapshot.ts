import type { BrandingConfig } from '../../../types/branding'
import type { FilledSlot, PrintTemplate } from '../../../types/selfBooth'

export interface OrderFrameSnapshot {
  template: PrintTemplate
  index: number
  slots: Array<FilledSlot | null>
  sourceSlots: Array<FilledSlot | null>
}

export interface OrderPhotoSnapshot {
  frames: OrderFrameSnapshot[]
  branding: BrandingConfig
  release: () => void
}

interface SnapshotDependencies {
  readBlob: (source: string) => Promise<Blob>
  createObjectURL: (blob: Blob) => string
  revokeObjectURL: (source: string) => void
}

const sourceScheme = (source: string) => source.match(/^([a-z][a-z0-9+.-]*):/i)?.[1]?.toLowerCase() ?? 'relative'

const defaultReadBlob = async (source: string) => {
  let response: Response
  try { response = await fetch(source) }
  catch (reason) { throw new Error(`Customer photo fetch failed (${sourceScheme(source)}:).`, { cause: reason }) }
  if (!response.ok) throw new Error(`Customer photo fetch failed (${sourceScheme(source)}:, HTTP ${response.status}).`)
  const blob = await response.blob()
  if (!blob.size) throw new Error(`Customer photo is empty (${sourceScheme(source)}:).`)
  return blob
}

const defaultDependencies: SnapshotDependencies = {
  readBlob: defaultReadBlob,
  createObjectURL: (blob) => URL.createObjectURL(blob),
  revokeObjectURL: (source) => URL.revokeObjectURL(source),
}

/**
 * Retains canonical Blob references and creates attempt-owned URLs. React state,
 * frame navigation, and draft URL cleanup cannot invalidate an active Order.
 */
export async function createOrderPhotoSnapshot(
  frames: Array<{ template: PrintTemplate; index: number; slots: Array<FilledSlot | null> }>,
  branding: BrandingConfig,
  dependencies: SnapshotDependencies = defaultDependencies,
): Promise<OrderPhotoSnapshot> {
  const attemptUrls: string[] = []
  const photoBlobs = new Map<string, Blob>()
  const photos = new Map<string, { blob: Blob; src: string }>()
  try {
    const uniquePhotos = new Map<string, FilledSlot['photo']>()
    frames.forEach((frame) => frame.slots.forEach((slot) => { if (slot && !uniquePhotos.has(slot.photo.id)) uniquePhotos.set(slot.photo.id, slot.photo) }))
    for (const photo of uniquePhotos.values()) {
      const blob = photo.blob ?? await dependencies.readBlob(photo.src)
      if (!(blob instanceof Blob) || blob.size <= 0) throw new Error(`Customer photo Blob is missing or empty (${photo.id}).`)
      photoBlobs.set(photo.id, blob)
    }
    for (const photo of uniquePhotos.values()) {
      const blob = photoBlobs.get(photo.id)!
      const src = dependencies.createObjectURL(blob)
      attemptUrls.push(src)
      photos.set(photo.id, { blob, src })
    }
    const snapshotFrames = frames.map((frame) => ({
      template: structuredClone(frame.template),
      index: frame.index,
      sourceSlots: frame.slots,
      slots: frame.slots.map((slot) => {
        if (!slot) return null
        const retained = photos.get(slot.photo.id)
        if (!retained) throw new Error(`Customer photo snapshot is missing (${slot.photo.id}).`)
        const { blob, src } = retained
        return {
          photo: { ...slot.photo, src, previewSrc: undefined, blob, previewBlob: undefined },
          transform: { ...slot.transform },
          fit: slot.fit,
          filter: slot.filter,
        }
      }),
    }))
    let released = false
    return {
      frames: snapshotFrames,
      branding: structuredClone(branding),
      release: () => {
        if (released) return
        released = true
        attemptUrls.forEach(dependencies.revokeObjectURL)
      },
    }
  } catch (reason) {
    attemptUrls.forEach(dependencies.revokeObjectURL)
    throw reason
  }
}

export async function runFailureSafeOrder<T>(attempt: () => Promise<T>, cleanupAfterConfirmedSuccess: (result: T) => Promise<void>) {
  const confirmed = await attempt()
  await cleanupAfterConfirmedSuccess(confirmed)
  return confirmed
}
