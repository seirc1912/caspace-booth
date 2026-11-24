import { useCallback, useEffect, useRef, useState } from 'react'
import { BOOTH_POLL_MS, fetchBoothPhotos, stabilizeBoothPhotos, type BoothPhotoList, type StableBoothPhotos } from './boothPhotosClient'

/**
 * Loads the customer's booth photos for `phone`; while `poll` is true it refreshes every
 * 10 s so photos Capture One is still exporting appear on their own. Photos already shown keep
 * their links (see stabilizeBoothPhotos), so polling never reloads an image.
 */
export function useBoothPhotos(phone: string | null, poll: boolean) {
  // Results are keyed by phone so a new number never shows the previous customer's photos.
  const [state, setState] = useState<{ phone: string; list: BoothPhotoList | null; error: string | null } | null>(null)
  const stable = useRef<{ phone: string; value: StableBoothPhotos } | null>(null)
  const refresh = useCallback(async () => {
    if (!phone) return null
    try {
      const fetched = await fetchBoothPhotos(phone)
      let next: BoothPhotoList = fetched
      if (fetched.status === 'ok') {
        const value = stabilizeBoothPhotos(stable.current?.phone === phone ? stable.current.value : null, fetched.photos)
        stable.current = { phone, value }
        next = { status: 'ok', photos: value.photos }
      } else stable.current = null
      setState((current) => current && current.phone === phone && current.error === null && current.list?.status === next.status && current.list.photos === next.photos ? current : { phone, list: next, error: null })
      return next
    } catch (reason) {
      setState((current) => ({ phone, list: current?.phone === phone ? current.list : null, error: reason instanceof Error ? reason.message : 'Không tải được ảnh phòng chụp.' }))
      return null
    }
  }, [phone])
  useEffect(() => { void refresh() }, [refresh])
  useEffect(() => {
    if (!poll || !phone) return
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void refresh() }, BOOTH_POLL_MS)
    return () => window.clearInterval(timer)
  }, [phone, poll, refresh])
  const current = state && state.phone === phone ? state : null
  return { list: current?.list ?? null, error: current?.error ?? null, refresh }
}
