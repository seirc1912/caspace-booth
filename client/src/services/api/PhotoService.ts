import type { Photo } from '../../models/Photo'

export interface ListPhotosQuery {
  sessionId: string
  cursor?: string
  limit?: number
}

export interface PhotoPage {
  items: Photo[]
  nextCursor: string | null
}

export interface PhotoService {
  list(query: ListPhotosQuery): Promise<PhotoPage>
  getById(sessionId: string, photoId: string): Promise<Photo>
}
