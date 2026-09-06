import { downloadBlob } from './downloadBlob'
import { prepareCompositionDownload, type DownloadCompositionInput } from './downloadComposition'

interface FileShareNavigator {
  canShare?: (data: ShareData) => boolean
  share?: (data: ShareData) => Promise<void>
}

interface FileDeliveryOptions {
  download?: (blob: Blob, filename: string) => void
  navigator?: FileShareNavigator
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
  let fileSharingSupported = typeof navigatorApi.share === 'function'
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

export async function saveComposition(input: DownloadCompositionInput) {
  const prepared = await prepareCompositionDownload(input)
  const delivery = await deliverImageFile(prepared.blob, prepared.filename)
  return { filename: prepared.filename, bytes: prepared.bytes, width: prepared.width, height: prepared.height, delivery }
}
