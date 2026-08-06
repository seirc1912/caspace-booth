import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { AssetLibraryContext } from './AssetLibraryContext'
import type { AdminAsset, AdminAssetType } from './AssetLibraryContext'

const storageKey = 'selfbooth.admin-assets.v1'
const maxFileSize = 5 * 1024 * 1024

function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function loadAssets(): AdminAsset[] {
  try { return JSON.parse(localStorage.getItem(storageKey) ?? '[]') as AdminAsset[] } catch { return [] }
}

export function AssetLibraryProvider({ children }: { children: ReactNode }) {
  const [assets, setAssets] = useState(loadAssets)
  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(assets)) } catch { /* Storage quota is best-effort until the asset API is connected. */ }
  }, [assets])
  const value = useMemo(() => ({
    assets,
    add: async (files: FileList, type: AdminAssetType) => {
      const accepted = Array.from(files).filter((file) => file.type.startsWith('image/') && file.size <= maxFileSize)
      const additions = await Promise.all(accepted.map(async (file) => ({ id: crypto.randomUUID(), name: file.name, type, dataUrl: await readAsDataUrl(file), createdAt: new Date().toISOString() })))
      setAssets((current) => [...additions, ...current].slice(0, 50))
    },
    remove: (id: string) => setAssets((current) => current.filter((item) => item.id !== id)),
  }), [assets])
  return <AssetLibraryContext.Provider value={value}>{children}</AssetLibraryContext.Provider>
}
