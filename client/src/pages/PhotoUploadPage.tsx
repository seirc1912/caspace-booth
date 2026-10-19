import { useEffect, useRef, useState } from 'react'
import { BrandMark } from '../components/branding/BrandMark'
import { PageShell } from '../components/layout/PageShell'
import { uploadPhotoToStorage } from '../features/photoUpload/uploadClient'
import { isValidVietnamesePhone, normalizeVietnamesePhone, PHOTO_UPLOAD_MAX_FILES, snapshotSelectedFiles, validateSelectedFiles } from '../features/photoUpload/validation'

interface SelectedPhoto {
  file: File
  id: string
  previewUrl: string
  progress: number
  state: 'ready' | 'uploading' | 'uploaded' | 'failed'
}

const successMessage = 'Ảnh của bạn đã được gửi thành công đến Cá Space! Vui lòng cung cấp số điện thoại cho nhân viên để nhận ảnh in nhé.'

function makePhoto(file: File): SelectedPhoto {
  return { file, id: crypto.randomUUID(), previewUrl: URL.createObjectURL(file), progress: 0, state: 'ready' }
}

export function PhotoUploadPage() {
  const inputRef = useRef<HTMLInputElement>(null)
  const submittingRef = useRef(false)
  const submissionIdRef = useRef(crypto.randomUUID())
  const photosRef = useRef<SelectedPhoto[]>([])
  const [phone, setPhone] = useState('')
  const [photos, setPhotos] = useState<SelectedPhoto[]>([])
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)
  const validPhone = isValidVietnamesePhone(phone)

  useEffect(() => { photosRef.current = photos }, [photos])
  useEffect(() => () => { for (const photo of photosRef.current) URL.revokeObjectURL(photo.previewUrl) }, [])

  const addFiles = (incoming: FileList | null) => {
    if (!incoming) return
    const selectedFiles = snapshotSelectedFiles(incoming)
    setMessage(null)
    const nextFiles = [...photos.map(({ file }) => file), ...selectedFiles]
    const error = validateSelectedFiles(nextFiles)
    if (error) { setMessage({ kind: 'error', text: error }); return }
    setPhotos((current) => [...current, ...selectedFiles.map(makePhoto)])
    submissionIdRef.current = crypto.randomUUID()
  }

  const removePhoto = (id: string) => {
    setPhotos((current) => {
      const removed = current.find((photo) => photo.id === id)
      if (removed) URL.revokeObjectURL(removed.previewUrl)
      return current.filter((photo) => photo.id !== id)
    })
    submissionIdRef.current = crypto.randomUUID()
    setMessage(null)
  }

  const submit = async () => {
    if (submittingRef.current) return
    const fileError = validateSelectedFiles(photos.map(({ file }) => file))
    if (!validPhone || fileError) {
      setMessage({ kind: 'error', text: !validPhone ? 'Vui lòng nhập đúng số điện thoại Việt Nam.' : fileError! })
      return
    }
    submittingRef.current = true
    setUploading(true)
    setMessage(null)
    const normalizedPhone = normalizeVietnamesePhone(phone)
    try {
      for (let index = 0; index < photos.length; index += 1) {
        const photo = photos[index]!
        if (photo.state === 'uploaded') continue
        setPhotos((current) => current.map((item) => item.id === photo.id ? { ...item, state: 'uploading', progress: 0 } : item))
        await uploadPhotoToStorage({
          file: photo.file,
          phone: normalizedPhone,
          requestId: `${submissionIdRef.current}-${index}`,
          onProgress: ({ loaded, total }) => setPhotos((current) => current.map((item) => item.id === photo.id ? { ...item, progress: total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0 } : item)),
        })
        setPhotos((current) => current.map((item) => item.id === photo.id ? { ...item, state: 'uploaded', progress: 100 } : item))
      }
      setMessage({ kind: 'success', text: successMessage })
      submissionIdRef.current = crypto.randomUUID()
    } catch (reason) {
      setPhotos((current) => current.map((item) => item.state === 'uploading' ? { ...item, state: 'failed' } : item))
      setMessage({ kind: 'error', text: reason instanceof Error ? reason.message : 'Không thể gửi ảnh. Vui lòng thử lại.' })
    } finally {
      submittingRef.current = false
      setUploading(false)
    }
  }

  const overallProgress = photos.length ? Math.round(photos.reduce((sum, photo) => sum + photo.progress, 0) / photos.length) : 0

  return <PageShell className="bg-[#f3eee7]">
    <header className="flex items-center justify-between gap-4"><a className="min-h-11 rounded-full bg-white px-4 py-3 text-sm font-bold shadow-sm" href="/">← Trang chủ</a><BrandMark compact /><span className="w-[5.5rem]" /></header>
    <section className="mx-auto mt-7 w-full max-w-2xl">
      <div className="text-center"><p className="text-xs font-black uppercase tracking-[0.24em] text-rose-700">Cá Space</p><h1 className="mt-2 text-4xl font-black tracking-[-0.05em]">UPLOAD ẢNH</h1><p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-stone-600">Gửi ảnh đã ghép frame đến Cá Space để in với chất lượng gốc.</p></div>
      <div className="mt-7 rounded-[2rem] bg-white p-5 shadow-sm sm:p-8">
        <label className="block text-sm font-black" htmlFor="upload-phone">Số điện thoại</label>
        <input aria-invalid={phone.length > 0 && !validPhone} autoComplete="tel" className="mt-2 min-h-14 w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 text-lg font-bold outline-none transition focus:border-stone-950 focus:ring-4 focus:ring-stone-100" disabled={uploading} id="upload-phone" inputMode="tel" onChange={(event) => { setPhone(event.target.value); setMessage(null) }} placeholder="Nhập số điện thoại của bạn" type="tel" value={phone} />
        {phone.length > 0 && !validPhone ? <p className="mt-2 text-sm font-semibold text-rose-700">Vui lòng nhập đúng số điện thoại Việt Nam.</p> : null}
        <button className="mt-5 min-h-14 w-full rounded-2xl border-2 border-dashed border-stone-300 bg-stone-50 px-5 font-black text-stone-700 transition hover:border-stone-950 disabled:opacity-50" disabled={uploading || photos.length >= PHOTO_UPLOAD_MAX_FILES} onClick={() => inputRef.current?.click()} type="button">+ CHỌN ẢNH PNG / JPG</button>
        <input accept=".png,.jpg,.jpeg,image/png,image/jpeg" aria-label="Chọn ảnh để gửi" className="sr-only" disabled={uploading} multiple onChange={(event) => { addFiles(event.currentTarget.files); event.currentTarget.value = '' }} ref={inputRef} type="file" />
        {photos.length ? <div className="mt-5 grid gap-3 sm:grid-cols-2">{photos.map((photo) => <article className="flex min-w-0 items-center gap-3 rounded-2xl border border-stone-200 p-3" key={photo.id}><img alt="" className="size-16 shrink-0 rounded-xl object-cover" src={photo.previewUrl} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{photo.file.name}</p><p className="mt-1 text-xs text-stone-500">{(photo.file.size / 1024 / 1024).toFixed(1)} MB · {photo.state === 'uploaded' ? 'Đã gửi' : photo.state === 'failed' ? 'Chưa gửi được' : `${photo.progress}%`}</p><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-stone-100"><div className={`h-full rounded-full transition-[width] ${photo.state === 'failed' ? 'bg-rose-600' : 'bg-stone-950'}`} style={{ width: `${photo.progress}%` }} /></div></div><button aria-label={`Xóa ${photo.file.name}`} className="grid size-11 shrink-0 place-items-center rounded-full bg-stone-100 text-lg font-bold disabled:opacity-40" disabled={uploading} onClick={() => removePhoto(photo.id)} type="button">×</button></article>)}</div> : <p className="mt-4 text-center text-sm text-stone-400">Chưa chọn ảnh.</p>}
        {uploading ? <div className="mt-5" aria-live="polite"><div className="flex justify-between text-sm font-bold"><span>{overallProgress === 0 ? 'Đang chuẩn bị ảnh…' : 'Đang gửi ảnh…'}</span><span>{overallProgress}%</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-stone-100"><div className="h-full rounded-full bg-rose-700 transition-[width]" style={{ width: `${overallProgress}%` }} /></div></div> : null}
        {message ? <div className={`mt-5 rounded-2xl px-4 py-3 text-sm font-bold leading-6 ${message.kind === 'success' ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'}`} role={message.kind === 'error' ? 'alert' : 'status'}>{message.text}</div> : null}
        <button className="mt-5 min-h-16 w-full rounded-2xl bg-stone-950 px-6 text-lg font-black text-white shadow-lg disabled:cursor-not-allowed disabled:opacity-40" disabled={uploading || !validPhone || photos.length === 0 || photos.every((photo) => photo.state === 'uploaded')} onClick={submit} type="button">{uploading ? `ĐANG GỬI ${overallProgress}%` : 'GỬI ẢNH'}</button>
      </div>
    </section>
  </PageShell>
}
