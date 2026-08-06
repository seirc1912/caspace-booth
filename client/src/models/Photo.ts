import type { PhotoAsset } from '../types/selfBooth'

export type PhotoStatus = 'processing' | 'ready' | 'failed' | 'archived'

export interface Photo extends PhotoAsset {
  sessionId: string
  originalUrl: string
  thumbnailUrl: string | null
  filename: string
  mimeType: string
  width: number | null
  height: number | null
  capturedAt: string | null
  createdAt: string
  status: PhotoStatus
}

export interface PhotoSelection {
  photoId: string
  slotId: string
}
