import { useState } from 'react'
import { BoothPoolSheet } from '../editor/BoothPoolSheet'
import { BottomSheet } from '../chrome/BottomSheet'
import { Button } from '../chrome/Button'
import { PhoneInput } from '../chrome/PhoneInput'
import { Icon } from '../ui/Icon'
import { createBoothPhotoLoader, fetchBoothPhotos, type BoothPhoto } from '../../features/boothPhotos/boothPhotosClient'
import { isValidPhoneNumber, normalizePhoneNumber } from '../../features/orders/phoneNumber'

const journeyStorageKey = 'selfbooth.customer-journey.v1'

/** The phone the customer typed on the home page (same tab), so they rarely type it twice. */
export function rememberedPhone() {
  try { return (JSON.parse(sessionStorage.getItem(journeyStorageKey) ?? '{}') as { phoneNumber?: string }).phoneNumber ?? '' } catch { return '' }
}

export interface CloudPhotos { phone: string; photos: BoothPhoto[] }

interface CloudPhotoSheetProps {
  /** Photos already listed in this visit: "Ảnh khác" opens the grid straight away. */
  initial: CloudPhotos | null
  onListed: (value: CloudPhotos) => void
  onPicked: (file: File) => void
  onUsePhone: () => void
  onClose: () => void
}

const loader = createBoothPhotoLoader()

/**
 * Cá Color Lab source picker: booth photos and photos the customer sent (kept 6 hours on Supabase),
 * looked up by phone number like the editor, or a photo from the phone. Only the one original
 * chosen is downloaded; the edit still happens on the device.
 */
export function CloudPhotoSheet({ initial, onListed, onPicked, onUsePhone, onClose }: CloudPhotoSheetProps) {
  const [phone, setPhone] = useState(initial?.phone ?? rememberedPhone())
  const [touched, setTouched] = useState(false)
  const [loading, setLoading] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [photos, setPhotos] = useState<BoothPhoto[] | null>(initial?.photos.length ? initial.photos : null)
  const valid = isValidPhoneNumber(phone)
  const state = valid ? 'valid' : phone.length && (touched || phone.replace(/\D/g, '').length >= 10) ? 'error' : phone.length ? 'typing' : 'empty'

  const lookUp = async () => {
    setTouched(true)
    if (!valid || loading) return
    setLoading(true); setMessage(null)
    try {
      const normalized = normalizePhoneNumber(phone)
      const list = await fetchBoothPhotos(normalized)
      if (list.status !== 'ok' || !list.photos.length) { setMessage('Chưa có ảnh của số này. Ảnh phòng chụp và ảnh bạn gửi được lưu 6 giờ; quá hạn, vui lòng liên hệ nhân viên để nhận ảnh qua Google Drive.'); return }
      onListed({ phone: normalized, photos: list.photos })
      setPhotos(list.photos)
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'Không tải được ảnh. Vui lòng thử lại.')
    } finally { setLoading(false) }
  }

  const pick = async (ids: string[]) => {
    const photo = photos?.find((item) => item.id === ids[0])
    if (!photo || downloading) return
    setDownloading(true); setMessage(null)
    try { onPicked(await loader.load(photo)) }
    catch { setMessage('Không tải được ảnh gốc. Vui lòng thử lại.'); setPhotos(null) }
    finally { setDownloading(false) }
  }

  if (photos && !downloading) return <BoothPoolSheet confirmLabel="Chỉnh màu ảnh này" mode="pick" pickSubtitle={`${photos.length} ảnh. Chọn 1 ảnh để chỉnh màu; chạm ⤢ để xem lớn.`} onClose={onClose} onConfirm={(ids) => void pick(ids)} onUsePhone={onUsePhone} photos={photos} />

  return <BottomSheet footer={<div className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.5fr)] gap-2.5"><Button disabled={downloading} icon={<Icon className="size-[18px]" name="mobile" />} onClick={onUsePhone} variant="chrome">Từ điện thoại</Button><Button disabled={downloading} loading={loading || downloading} onClick={() => void lookUp()}>{downloading ? 'Đang tải ảnh…' : loading ? 'Đang tìm ảnh…' : 'Xem ảnh'}</Button></div>} onClose={onClose} subtitle="Ảnh phòng chụp và ảnh bạn đã gửi cho quán, lưu 6 giờ." title="Lấy ảnh của bạn">
    <label className="text-sm font-bold" htmlFor="color-lab-phone">Số điện thoại lúc chụp</label>
    <div className="mt-2"><PhoneInput describedBy={state === 'error' ? 'color-lab-phone-error' : undefined} disabled={loading || downloading} id="color-lab-phone" onChange={(value) => { setPhone(value); setTouched(false); setMessage(null) }} onEnter={() => void lookUp()} placeholder="Nhập số điện thoại của bạn" size="md" state={state} value={phone} /></div>
    {state === 'error' ? <p className="mt-2 text-[13px] font-semibold text-cs-red-text" id="color-lab-phone-error">Vui lòng nhập đúng số điện thoại Việt Nam.</p> : null}
    {message ? <p className="mt-3 rounded-[14px] border border-cs-alert-error-border bg-cs-alert-error-bg p-2.5 text-sm font-bold text-cs-alert-error-fg" role="alert">{message}</p> : null}
  </BottomSheet>
}
