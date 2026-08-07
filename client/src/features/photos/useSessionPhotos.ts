import { useEffect } from 'react'
import { supabase } from '../../services/catalog/SupabaseCatalogService'
import type { PhotoAsset } from '../../types/selfBooth'

export interface PhotoLibrarySession {
  sessionId: string
  accessToken: string
  boothId: string
  phoneNumber: string
  createdAt: string
}

interface PhotoRow { id: string; session_id: string; storage_path: string; source_name: string; created_at: string }
const photoUrl = (path: string) => supabase.storage.from('session-photos').getPublicUrl(path).data.publicUrl
const toAsset = (photo: PhotoRow): PhotoAsset => ({ id: photo.id, src: photoUrl(photo.storage_path), previewSrc: photoUrl(photo.storage_path), alt: photo.source_name, source: 'selfbooth' })

export async function startPhotoLibrarySession(boothId: string, phoneNumber: string): Promise<PhotoLibrarySession> {
  const { data, error } = await supabase.rpc('customer_start_photo_session', { p_booth_id: boothId, p_phone_number: phoneNumber })
  if (error) throw new Error(error.message)
  const row = (data as Array<{ session_id: string; access_token: string; booth_id: string; phone_number: string; created_at: string }> | null)?.[0]
  if (!row) throw new Error('Supabase did not create a customer session')
  return { sessionId: row.session_id, accessToken: row.access_token, boothId: row.booth_id, phoneNumber: row.phone_number, createdAt: row.created_at }
}

export function useSessionPhotos(session: PhotoLibrarySession | null, onPhotos: (photos: PhotoAsset[]) => void, onError: (message: string) => void) {
  useEffect(() => {
    if (!session) return
    let active = true
    void (async () => {
      try {
        const { data, error } = await supabase.rpc('customer_list_session_photos', { p_session_id: session.sessionId, p_access_token: session.accessToken })
        if (error) throw error
        if (active) onPhotos(((data ?? []) as PhotoRow[]).map(toAsset))
      } catch (error) { if (active) onError(error instanceof Error ? error.message : 'Unable to load session photos') }
    })()

    const channel = supabase.channel(`session-photos:${session.sessionId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'session_photos', filter: `session_id=eq.${session.sessionId}` }, (payload) => {
        if (active) onPhotos([toAsset(payload.new as PhotoRow)])
      })
      .subscribe((status) => { if (active && status === 'CHANNEL_ERROR') onError('Photo Library realtime connection failed') })

    return () => { active = false; void supabase.removeChannel(channel) }
  }, [onError, onPhotos, session])
}
