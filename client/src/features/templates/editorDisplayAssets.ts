import type { PrintTemplate } from '../../types/selfBooth'
import { fetchRemoteAsset } from '../orders/services/renderComposition'

const publicObjectPath = '/storage/v1/object/public/'
const publicRenderPath = '/storage/v1/render/image/public/'

export function editorDisplayAssetUrl(source: string, width = 900) {
  try {
    const url = new URL(source)
    if (!url.pathname.includes(publicObjectPath)) return source
    url.pathname = url.pathname.replace(publicObjectPath, publicRenderPath)
    url.searchParams.set('width', String(width))
    url.searchParams.set('resize', 'contain')
    url.searchParams.set('quality', '80')
    return url.toString()
  } catch { return source }
}

interface CachedDisplayAsset {
  objectUrl: string
  image: HTMLImageElement
  bytes: number
}

export class EditorDisplayAssetCache {
  private readonly entries = new Map<string, Promise<CachedDisplayAsset>>()

  load(template: PrintTemplate) {
    const source = template.backgroundUrl
    if (!source || !/^https?:/i.test(source)) return Promise.resolve(null)
    let entry = this.entries.get(template.id)
    if (!entry) {
      const displaySource = editorDisplayAssetUrl(source)
      entry = fetchRemoteAsset(displaySource, 'template-background').then(async (blob) => {
        const objectUrl = URL.createObjectURL(blob)
        const image = new Image()
        image.decoding = 'async'
        image.src = objectUrl
        try { await image.decode() }
        catch (reason) { URL.revokeObjectURL(objectUrl); throw reason }
        return { objectUrl, image, bytes: blob.size }
      })
      this.entries.set(template.id, entry)
      void entry.catch(() => { if (this.entries.get(template.id) === entry) this.entries.delete(template.id) })
    }
    return entry
  }

  retainOnly(templateIds: Iterable<string>) {
    const retained = new Set(templateIds)
    for (const [templateId, entry] of this.entries) {
      if (retained.has(templateId)) continue
      this.entries.delete(templateId)
      void entry.then(({ objectUrl }) => URL.revokeObjectURL(objectUrl), () => undefined)
    }
  }

  clear() { this.retainOnly([]) }
}
