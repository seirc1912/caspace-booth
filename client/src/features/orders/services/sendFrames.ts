import type { BrandingConfig } from '../../../types/branding'
import type { FilledSlot, PrintTemplate } from '../../../types/selfBooth'
import { queueThumbnailUpload } from '../../photoUpload/thumbnail'
import { MAX_UPLOAD_CONCURRENCY, runUploadQueue, uploadPhotoToStorage } from '../../photoUpload/uploadClient'
import { prepareCompositionDownload } from './downloadComposition'
import type { RenderAssetCache } from './renderComposition'

export interface SendableFrame { templateId: string; frameNumber: number; template: PrintTemplate; slots: Array<FilledSlot | null> }
export type FrameSendState = 'waiting' | 'rendering' | 'uploading' | 'sent' | 'failed'

export interface SendFramesDeps {
  render?: (frame: SendableFrame) => Promise<File>
  upload?: typeof uploadPhotoToStorage
  thumbnail?: typeof queueThumbnailUpload
  concurrency?: number
}

/** A frame is ready to send when every slot has a photo. */
export function isFrameFilled(slots: Array<FilledSlot | null> | undefined) {
  return Boolean(slots?.length) && slots!.every(Boolean)
}

/** What was sent, so an unchanged frame is not sent twice; any edit changes the signature. */
export function frameSignature(slots: Array<FilledSlot | null>) {
  return JSON.stringify(slots.map((slot) => slot && { photo: slot.photo.id, transform: slot.transform }))
}

export function renderFrameFile(input: { branding: BrandingConfig; assetCache?: RenderAssetCache }) {
  return async (frame: SendableFrame) => {
    const prepared = await prepareCompositionDownload({ assetCache: input.assetCache, branding: input.branding, slots: frame.slots, template: frame.template })
    const name = prepared.filename.replace(/(\.[a-z]+)$/i, `-khung${frame.frameNumber}$1`)
    return new File([prepared.blob], name, { type: prepared.blob.type || 'image/jpeg' })
  }
}

/**
 * Renders the chosen frames one at a time (canvas work is heavy on phones) and uploads
 * them through the normal customer pipeline (2 lanes, TUS > 6 MB, retries, staff
 * thumbnail) into `{phone}/`, exactly where /staff/photos looks. One failure does not
 * stop the others.
 */
export async function sendFrames(input: { frames: SendableFrame[]; phone: string; submissionId: string; render: (frame: SendableFrame) => Promise<File>; onState: (templateId: string, state: FrameSendState, progress?: number) => void }, deps: SendFramesDeps = {}) {
  const upload = deps.upload ?? uploadPhotoToStorage
  const thumbnail = deps.thumbnail ?? queueThumbnailUpload
  const render = deps.render ?? input.render
  let renderLock = Promise.resolve()
  const renderExclusive = (frame: SendableFrame) => {
    const result = renderLock.then(() => render(frame))
    renderLock = result.then(() => undefined, () => undefined)
    return result
  }
  input.frames.forEach((frame) => input.onState(frame.templateId, 'waiting'))
  const failures = await runUploadQueue(input.frames, async (frame) => {
    try {
      input.onState(frame.templateId, 'rendering')
      const file = await renderExclusive(frame)
      input.onState(frame.templateId, 'uploading', 0)
      const requestId = `${input.submissionId}-f${frame.frameNumber}`
      await upload({ file, phone: input.phone, requestId, onProgress: ({ loaded, total }) => input.onState(frame.templateId, 'uploading', total > 0 ? Math.round((loaded / total) * 100) : 0) })
      void thumbnail({ file, phone: input.phone, requestId })
      input.onState(frame.templateId, 'sent', 100)
    } catch (reason) {
      input.onState(frame.templateId, 'failed')
      throw reason
    }
  }, deps.concurrency ?? MAX_UPLOAD_CONCURRENCY)
  return input.frames.map((frame, index) => {
    const failure = failures.find((item) => item.index === index)
    return { templateId: frame.templateId, ok: !failure, error: failure ? (failure.reason instanceof Error ? failure.reason.message : String(failure.reason)) : null }
  })
}
