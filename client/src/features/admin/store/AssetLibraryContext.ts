import { createContext, useContext } from 'react'

export type AdminAssetType = 'background' | 'cover' | 'thumbnail' | 'logo' | 'sticker' | 'overlay'

export interface AdminAsset { id: string; name: string; type: AdminAssetType; dataUrl: string; createdAt: string }

interface AssetLibraryValue {
  assets: AdminAsset[]
  add: (files: FileList, type: AdminAssetType) => Promise<void>
  remove: (id: string) => void
}

export const AssetLibraryContext = createContext<AssetLibraryValue | null>(null)

export function useAssetLibrary() {
  const value = useContext(AssetLibraryContext)
  if (!value) throw new Error('useAssetLibrary must be used inside AssetLibraryProvider')
  return value
}
