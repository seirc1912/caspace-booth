import { useCallback, useEffect, useState } from 'react'
import { BOOTH_POLL_MS, fetchBoothPhotos, type BoothPhotoList } from './boothPhotosClient'

/**
 * Loads the customer's booth photos for `phone`; while `poll` is true it refreshes every
 * 10 s so photos Capture One is still exporting appear on their own.
 */
export function useBoothPhotos(phone: string | null, poll: boolean) {
  // Results are keyed by phone so a new number never shows the previous customer's photos.
  const [state, setState] = useState<{ phone: string; list: BoothPhotoList | null; error: string | null } | null>(null)
  const refresh = useCallback(async () => {
    if (!phone) return null
    try {
      const next = await fetchBoothPhotos(phone)
      setState({ phone, list: next, error: null })
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
