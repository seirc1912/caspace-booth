import { useEffect, useRef, useState } from 'react'
import { BrandMark } from '../components/branding/BrandMark'
import { PageShell } from '../components/layout/PageShell'
import { newRunId, reportClientTiming, uploadBatchEvent, uploadFileEvent } from '../features/metrics/clientTiming'
import { calculateOverallUploadProgress, runUploadQueue, uploadPhotoToStorage } from '../features/photoUpload/uploadClient'
import { photoSource, preloadPhoto, releasePreload } from '../features/photoUpload/preload'
import { queueThumbnailUpload } from '../features/photoUpload/thumbnail'
import { isValidVietnamesePhone, normalizeVietnamesePhone, PHOTO_UPLOAD_MAX_FILES, snapshotSelectedFiles, validateSelectedFiles } from '../features/photoUpload/validation'

interface SelectedPhoto {
  file: File
  id: string
  previewUrl: string
  prepared: boolean // file bytes read into memory (slow on some Android phones)
  progress: number
  uploadedBytes: number
  state: 'ready' | 'uploading' | 'uploaded' | 'failed'
}

const successMessage = 'Ảnh của bạn đã được gửi thành công đến Cá Space! Vui lòng cung cấp số điện thoại cho nhân viên để nhận ảnh in nhé.'

function makePhoto(file: File): SelectedPhoto {
  return { file, id: crypto.randomUUID(), previewUrl: URL.createObjectURL(file), prepared: false, progress: 0, uploadedBytes: 0, state: 'ready' }
}

export function PhotoUploadPage() {
  const inputRef = useRef<HTMLInputElement>(null)
  const phoneRef = useRef<HTMLInputElement>(null)
  const submittingRef = useRef(false)
  const submissionIdRef = useRef(crypto.randomUUID())
  const attemptRef = useRef(0) // presses of "GỬI ẢNH" for the current selection
  const activeBatchRef = useRef<{ runId: string; startedAt: number; fileCount: number; totalBytes: number; okCount: number; attempt: number } | null>(null)
  const photosRef = useRef<SelectedPhoto[]>([])
  const [phone, setPhone] = useState('')
  const [photos, setPhotos] = useState<SelectedPhoto[]>([])
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)
  const validPhone = isValidVietnamesePhone(phone)

  useEffect(() => { photosRef.current = photos }, [photos])
  useEffect(() => () => { for (const photo of photosRef.current) { URL.revokeObjectURL(photo.previewUrl); releasePreload(photo.file) } }, [])
  const markPrepared = (file: File) => setPhotos((current) => current.map((item) => item.file === file && !item.prepared ? { ...item, prepared: true } : item))
  // A customer closing/leaving the page mid-upload is reported as an abandoned batch.
  useEffect(() => {
    const onPageHide = (event: PageTransitionEvent) => {
      if (event.persisted) return // back/forward cache: the upload may still finish after restore
      const batch = activeBatchRef.current
      if (!batch) return
      activeBatchRef.current = null
      reportClientTiming(uploadBatchEvent(batch.runId, { fileCount: batch.fileCount, okCount: batch.okCount, failedCount: 0, totalMs: performance.now() - batch.startedAt, totalBytes: batch.totalBytes, attempt: batch.attempt, abandoned: true }))
    }
    window.addEventListener('pagehide', onPageHide)
    return () => window.removeEventListener('pagehide', onPageHide)
  }, [])

  const addFiles = (incoming: FileList | null) => {
    if (!incoming) return
    const selectedFiles = snapshotSelectedFiles(incoming)
    setMessage(null)
    const nextFiles = [...photos.map(({ file }) => file), ...selectedFiles]
    const error = validateSelectedFiles(nextFiles)
    if (error) { setMessage({ kind: 'error', text: error }); return }
    setPhotos((current) => [...current, ...selectedFiles.map(makePhoto)])
    // Start reading now (sequential, memory-bounded) so the wait overlaps with typing the phone number.
    for (const file of selectedFiles) void preloadPhoto(file)?.then(() => markPrepared(file), () => undefined)
    // Photos first, then the phone number: the photos are read while the customer types.
    if (!validPhone) window.setTimeout(() => phoneRef.current?.focus(), 0)
    submissionIdRef.current = crypto.randomUUID()
    attemptRef.current = 0
  }

  const removePhoto = (id: string) => {
    setPhotos((current) => {
      const removed = current.find((photo) => photo.id === id)
      if (removed) { URL.revokeObjectURL(removed.previewUrl); releasePreload(removed.file) }
      return current.filter((photo) => photo.id !== id)
    })
    submissionIdRef.current = crypto.randomUUID()
    attemptRef.current = 0
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
    // Batch timer: from tapping "GỬI ẢNH" until success/failure is shown (§4.4).
    const runId = newRunId()
    const batchStartedAt = performance.now()
    const pending = photos.map((photo, index) => ({ index, photo })).filter(({ photo }) => photo.state !== 'uploaded')
    let okCount = 0
    attemptRef.current += 1
    const totalBytes = pending.reduce((sum, { photo }) => sum + photo.file.size, 0)
    activeBatchRef.current = { runId, startedAt: batchStartedAt, fileCount: pending.length, totalBytes, okCount: 0, attempt: attemptRef.current }
    try {
      const failures = await runUploadQueue(pending, async ({ index, photo }) => {
        setPhotos((current) => current.map((item) => item.id === photo.id ? { ...item, state: 'uploading', progress: 0, uploadedBytes: 0 } : item))
        const source = photoSource(photo.file)
        try {
          await uploadPhotoToStorage({
            file: photo.file,
            source,
            onPrepared: () => markPrepared(photo.file),
            phone: normalizedPhone,
            requestId: `${submissionIdRef.current}-${index}`,
            onTiming: (timing) => { reportClientTiming(uploadFileEvent(runId, timing, photo.file)) },
            onProgress: ({ loaded, total }) => setPhotos((current) => current.map((item) => item.id === photo.id ? { ...item, progress: total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0, uploadedBytes: total > 0 ? Math.min(item.file.size, Math.round((loaded / total) * item.file.size)) : 0 } : item)),
          })
          okCount += 1
          const thumbnailRequestId = `${submissionIdRef.current}-${index}`
          // Thumbnail from the in-memory copy, then free it (the original stays selectable for retries).
          void source.then((file) => queueThumbnailUpload({ file, phone: normalizedPhone, requestId: thumbnailRequestId })).finally(() => releasePreload(photo.file))
          if (activeBatchRef.current?.runId === runId) activeBatchRef.current.okCount = okCount
          setPhotos((current) => current.map((item) => item.id === photo.id ? { ...item, state: 'uploaded', progress: 100, uploadedBytes: item.file.size } : item))
        } catch (reason) {
          setPhotos((current) => current.map((item) => item.id === photo.id ? { ...item, state: 'failed' } : item))
          throw reason
        }
      })
      if (failures.length) {
        // Other photos were still sent; only the failed ones need a retry.
        const first = failures[0]!.reason
        const detail = first instanceof Error ? ` ${first.message}` : ''
        throw new Error(okCount > 0
          ? `Đã gửi ${okCount}/${pending.length} ảnh. ${failures.length} ảnh chưa gửi được — bấm "GỬI LẠI ẢNH LỖI".${detail}`
          : `Chưa gửi được ${failures.length} ảnh — bấm "GỬI LẠI ẢNH LỖI".${detail}`)
      }
      setMessage({ kind: 'success', text: successMessage })
      submissionIdRef.current = crypto.randomUUID()
    attemptRef.current = 0
    } catch (reason) {
      setPhotos((current) => current.map((item) => item.state === 'uploading' ? { ...item, state: 'failed' } : item))
      setMessage({ kind: 'error', text: reason instanceof Error ? reason.message : 'Không thể gửi ảnh. Vui lòng thử lại.' })
    } finally {
      const totalMs = performance.now() - batchStartedAt
      const failedCount = pending.length - okCount // every photo is attempted; the rest failed
      const attempt = activeBatchRef.current?.attempt ?? attemptRef.current
      activeBatchRef.current = null
      reportClientTiming(uploadBatchEvent(runId, { fileCount: pending.length, okCount, failedCount, totalMs, totalBytes, attempt }))
      submittingRef.current = false
      setUploading(false)
    }
  }

  const failedPhotoCount = photos.filter((photo) => photo.state === 'failed').length
  const preparing = photos.some((photo) => photo.state === 'uploading' && !photo.prepared)
  const overallProgress = calculateOverallUploadProgress(photos.map((photo) => ({ size: photo.file.size, uploadedBytes: photo.uploadedBytes })))

  return <PageShell className="bg-[#f3eee7]">
    <header className="flex items-center justify-between gap-4"><a className="min-h-11 rounded-full bg-white px-4 py-3 text-sm font-bold shadow-sm" href="/">← Trang chủ</a><BrandMark compact /><span className="w-[5.5rem]" /></header>
    <section className="mx-auto mt-7 w-full max-w-2xl">
      <div className="text-center"><p className="text-xs font-black uppercase tracking-[0.24em] text-rose-700">Cá Space</p><h1 className="mt-2 text-4xl font-black tracking-[-0.05em]">UPLOAD ẢNH</h1><p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-stone-600">Gửi ảnh đã ghép frame đến Cá Space để in với chất lượng gốc.</p></div>
      <div className="mt-7 rounded-[2rem] bg-white p-5 shadow-sm sm:p-8">
        <p className="text-sm font-black">1. Chọn ảnh cần in</p>
        <button className="mt-2 min-h-14 w-full rounded-2xl border-2 border-dashed border-stone-300 bg-stone-50 px-5 font-black text-stone-700 transition hover:border-stone-950 disabled:opacity-50" disabled={uploading || photos.length >= PHOTO_UPLOAD_MAX_FILES} onClick={() => inputRef.current?.click()} type="button">+ CHỌN ẢNH PNG / JPG</button>
        <input accept=".png,.jpg,.jpeg,image/png,image/jpeg" aria-label="Chọn ảnh để gửi" className="sr-only" disabled={uploading} multiple onChange={(event) => { addFiles(event.currentTarget.files); event.currentTarget.value = '' }} ref={inputRef} type="file" />
        {photos.length ? <div className="mt-5 grid gap-3 sm:grid-cols-2">{photos.map((photo) => <article className="flex min-w-0 items-center gap-3 rounded-2xl border border-stone-200 p-3" key={photo.id}><img alt="" className="size-16 shrink-0 rounded-xl object-cover" src={photo.previewUrl} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{photo.file.name}</p><p className="mt-1 text-xs text-stone-500">{(photo.file.size / 1024 / 1024).toFixed(1)} MB · {photo.state === 'uploaded' ? 'Đã gửi' : photo.state === 'failed' ? 'Chưa gửi được' : photo.state === 'uploading' ? (photo.prepared ? `${photo.progress}%` : 'Đang chuẩn bị…') : photo.prepared ? 'Sẵn sàng' : 'Đang chuẩn bị…'}</p>{photo.state === 'uploading' ? <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-stone-100"><div className="h-full rounded-full bg-stone-950 transition-[width]" style={{ width: `${photo.progress}%` }} /></div> : null}</div><button aria-label={`Xóa ${photo.file.name}`} className="grid size-11 shrink-0 place-items-center rounded-full bg-stone-100 text-lg font-bold disabled:opacity-40" disabled={uploading} onClick={() => removePhoto(photo.id)} type="button">×</button></article>)}</div> : <p className="mt-4 text-center text-sm text-stone-400">Chưa chọn ảnh.</p>}
        <label className="mt-6 block text-sm font-black" htmlFor="upload-phone">2. Số điện thoại nhận ảnh</label>
        <input aria-invalid={phone.length > 0 && !validPhone} autoComplete="tel" className="mt-2 min-h-14 w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 text-lg font-bold outline-none transition focus:border-stone-950 focus:ring-4 focus:ring-stone-100" disabled={uploading} id="upload-phone" ref={phoneRef} inputMode="tel" onChange={(event) => { setPhone(event.target.value); setMessage(null) }} placeholder="Nhập số điện thoại của bạn" type="tel" value={phone} />
        {phone.length > 0 && !validPhone ? <p className="mt-2 text-sm font-semibold text-rose-700">Vui lòng nhập đúng số điện thoại Việt Nam.</p> : null}
        {uploading ? <div className="mt-5" aria-live="polite"><div className="flex justify-between text-sm font-bold"><span>{preparing || overallProgress === 0 ? 'Đang chuẩn bị ảnh…' : 'Đang gửi ảnh…'}</span><span>{overallProgress}%</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-stone-100"><div className="h-full rounded-full bg-rose-700 transition-[width]" style={{ width: `${overallProgress}%` }} /></div></div> : null}
        {message ? <div className={`mt-5 rounded-2xl px-4 py-3 text-sm font-bold leading-6 ${message.kind === 'success' ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'}`} role={message.kind === 'error' ? 'alert' : 'status'}>{message.text}</div> : null}
        <button className="mt-5 min-h-16 w-full rounded-2xl bg-stone-950 px-6 text-lg font-black text-white shadow-lg disabled:cursor-not-allowed disabled:opacity-40" disabled={uploading || !validPhone || photos.length === 0 || photos.every((photo) => photo.state === 'uploaded')} onClick={submit} type="button">{uploading ? (preparing ? 'ĐANG CHUẨN BỊ ẢNH…' : `ĐANG GỬI ${overallProgress}%`) : failedPhotoCount > 0 ? `GỬI LẠI ${failedPhotoCount} ẢNH LỖI` : 'GỬI ẢNH'}</button>
      </div>
    </section>
  </PageShell>
}
