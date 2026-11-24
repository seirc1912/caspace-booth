import { downloadBlob } from './downloadBlob'
import { prepareCompositionDownload, type DownloadCompositionInput } from './downloadComposition'
import { prefersShareSheet } from './shareSheet'

interface FileShareNavigator {
  canShare?: (data: ShareData) => boolean
  share?: (data: ShareData) => Promise<void>
}

interface FileDeliveryOptions {
  download?: (blob: Blob, filename: string) => void
  navigator?: FileShareNavigator
  /** Use the share sheet when the browser supports it (default: iPhone/iPad only). */
  shareSheet?: boolean
}

export type FileDelivery = 'shared' | 'downloaded' | 'cancelled'

export function isShareCancellation(reason: unknown) {
  return typeof reason === 'object' && reason !== null && 'name' in reason && reason.name === 'AbortError'
}

export async function deliverImageFile(blob: Blob, filename: string, options: FileDeliveryOptions = {}): Promise<FileDelivery> {
  const navigatorApi = options.navigator ?? navigator
  const download = options.download ?? downloadBlob
  const file = new File([blob], filename, { type: blob.type || 'image/png' })
  const shareData: ShareData = { files: [file] }
  let fileSharingSupported = (options.shareSheet ?? prefersShareSheet()) && typeof navigatorApi.share === 'function'
  try {
    if (fileSharingSupported && typeof navigatorApi.canShare === 'function') fileSharingSupported = navigatorApi.canShare(shareData)
  } catch {
    fileSharingSupported = false
  }

  if (!fileSharingSupported || !navigatorApi.share) {
    download(blob, filename)
    return 'downloaded'
  }

  try {
    await navigatorApi.share(shareData)
    return 'shared'
  } catch (reason) {
    if (isShareCancellation(reason)) return 'cancelled'
    download(blob, filename)
    return 'downloaded'
  }
}

/**
 * Several images in one go: one share sheet ("Lưu N hình ảnh" on iOS/Android) when
 * the browser can share files, otherwise one download per file. Must be called
 * straight from a tap — share sheets need a fresh user gesture.
 */
export async function deliverImageFiles(files: File[], options: FileDeliveryOptions = {}): Promise<FileDelivery> {
  const navigatorApi = options.navigator ?? navigator
  const download = options.download ?? downloadBlob
  const shareData: ShareData = { files }
  let supported = (options.shareSheet ?? prefersShareSheet()) && typeof navigatorApi.share === 'function'
  try { if (supported && typeof navigatorApi.canShare === 'function') supported = navigatorApi.canShare(shareData) } catch { supported = false }
  if (supported && navigatorApi.share) {
    try { await navigatorApi.share(shareData); return 'shared' }
    catch (reason) { if (isShareCancellation(reason)) return 'cancelled' }
  }
  files.forEach((file) => download(file, file.name))
  return 'downloaded'
}

export async function saveComposition(input: DownloadCompositionInput) {
  const renderStartedAt = performance.now()
  const prepared = await prepareCompositionDownload(input)
  // renderMs = draw + encode on the phone; deliveryMs includes the share sheet (customer interaction).
  const renderMs = performance.now() - renderStartedAt
  const deliveryStartedAt = performance.now()
  const delivery = await deliverImageFile(prepared.blob, prepared.filename)
  const deliveryMs = performance.now() - deliveryStartedAt
  const format: 'png' | 'jpg' = prepared.filename.endsWith('.jpg') ? 'jpg' : 'png'
  return { filename: prepared.filename, bytes: prepared.bytes, width: prepared.width, height: prepared.height, delivery, renderMs, deliveryMs, format }
}

export async function runPerFrameSave<T extends { delivery: FileDelivery }>(save: () => Promise<T>, onSaved: (result: T) => void) {
  const result = await save()
  if (result.delivery !== 'cancelled') onSaved(result)
  return result
}
