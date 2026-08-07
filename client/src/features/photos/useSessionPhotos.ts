import { useEffect } from 'react'
import { io } from 'socket.io-client'
import type { CustomerSession } from '../../types/session'
import type { PhotoAsset } from '../../types/selfBooth'
import { env } from '../../config/env'

interface ImportedPhoto { id: string; sessionId: string; sourceName: string; url: string }
const toAsset = (photo: ImportedPhoto): PhotoAsset => ({ id: photo.id, src: photo.url, previewSrc: photo.url, alt: photo.sourceName, source: 'selfbooth' })

export function useSessionPhotos(session: CustomerSession | null, onPhotos: (photos: PhotoAsset[]) => void, onError: (message: string) => void) {
  useEffect(() => {
    if (!session) return
    let active = true
    fetch(`${env.apiUrl}/api/photos/session/${session.sessionId}`, { headers: { 'X-Session-Token': session.token } })
      .then(async (response) => { if (!response.ok) throw new Error(await response.text()); return response.json() as Promise<ImportedPhoto[]> })
      .then((photos) => { if (active) onPhotos(photos.map(toAsset)) })
      .catch((error) => { if (active) onError(error instanceof Error ? error.message : 'Unable to load session photos') })
    const socket = io(env.apiUrl || undefined, { auth: { sessionId: session.sessionId, token: session.token }, transports: ['websocket', 'polling'] })
    socket.on('photo:imported', (photo: ImportedPhoto) => { if (active && photo.sessionId === session.sessionId) onPhotos([toAsset(photo)]) })
    socket.on('connect_error', (error: Error) => { if (active) onError(`Photo sync disconnected: ${error.message}`) })
    return () => { active = false; socket.disconnect() }
  }, [onError, onPhotos, session])
}
