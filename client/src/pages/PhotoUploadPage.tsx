import { useEffect, useRef, useState } from 'react'
import { Alert } from '../components/chrome/Alert'
import { AppHeader } from '../components/chrome/AppHeader'
import { BarHint, BottomBar } from '../components/chrome/BottomBar'
import { Button } from '../components/chrome/Button'
import { buttonClass } from '../components/chrome/buttonClass'
import { PhoneInput } from '../components/chrome/PhoneInput'
import { formatPhoneDisplay } from '../features/orders/phoneDisplay'
import { PageShell } from '../components/layout/PageShell'
import { Icon } from '../components/ui/Icon'
import { newRunId, reportClientTiming, uploadBatchEvent, uploadFileEvent } from '../features/metrics/clientTiming'
import { calculateOverallUploadProgress, runUploadQueue, uploadPhotoToStorage } from '../features/photoUpload/uploadClient'
import { forgetPhoto, photoSource, photoThumbnail, preloadPhoto, releasePreload } from '../features/photoUpload/preload'
import { queueThumbnailUpload } from '../features/photoUpload/thumbnail'
import { isValidVietnamesePhone, normalizeVietnamesePhone, PHOTO_UPLOAD_MAX_FILES, snapshotSelectedFiles, validateSelectedFiles } from '../features/photoUpload/validation'

interface SelectedPhoto {
  file: File
  id: string
  previewUrl: string | null // small JPEG made on the phone; never the full-size original
  prepared: boolean // file bytes read into memory (slow on some Android phones)
  progress: number
  uploadedBytes: number
  state: 'ready' | 'uploading' | 'uploaded' | 'failed'
}

const formatSize = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`
const formatType = (file: File) => /png$/i.test(file.type) || /\.png$/i.test(file.name) ? 'PNG' : 'JPG'

function makePhoto(file: File): SelectedPhoto {
  return { file, id: crypto.randomUUID(), previewUrl: null, prepared: false, progress: 0, uploadedBytes: 0, state: 'ready' }
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
  const [phoneTouched, setPhoneTouched] = useState(false)
  const validPhone = isValidVietnamesePhone(phone)

  useEffect(() => { photosRef.current = photos }, [photos])
  useEffect(() => () => { for (const photo of photosRef.current) { if (photo.previewUrl) URL.revokeObjectURL(photo.previewUrl); forgetPhoto(photo.file) } }, [])
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
    for (const file of selectedFiles) {
      void preloadPhoto(file)?.then(() => markPrepared(file), () => undefined)
      void photoThumbnail(file).then((thumbnail) => {
        if (!photosRef.current.some((item) => item.file === file)) return // removed meanwhile
        const previewUrl = URL.createObjectURL(thumbnail ?? file)
        setPhotos((current) => current.map((item) => item.file === file && !item.previewUrl ? { ...item, previewUrl } : item))
      })
    }
    // Photos first, then the phone number: the photos are read while the customer types.
    if (!validPhone) window.setTimeout(() => phoneRef.current?.focus(), 0)
    submissionIdRef.current = crypto.randomUUID()
    attemptRef.current = 0
  }

  const removePhoto = (id: string) => {
    setPhotos((current) => {
      const removed = current.find((photo) => photo.id === id)
      if (removed) { if (removed.previewUrl) URL.revokeObjectURL(removed.previewUrl); forgetPhoto(removed.file) }
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
      setPhoneTouched(true)
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
    const thumbnails: Array<Promise<void>> = []
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
          // Upload the JPEG made at pick time as the thumbnail, plus a 1600px copy for the large viewer,
          // then free the in-memory copy.
          const job = queueThumbnailUpload({ file: photo.file, thumbnail: photoThumbnail(photo.file), phone: normalizedPhone, requestId: thumbnailRequestId, preview: true })
          thumbnails.push(job.thumbnail)
          void job.done.finally(() => releasePreload(photo.file))
          if (activeBatchRef.current?.runId === runId) activeBatchRef.current.okCount = okCount
          setPhotos((current) => current.map((item) => item.id === photo.id ? { ...item, state: 'uploaded', progress: 100, uploadedBytes: item.file.size } : item))
        } catch (reason) {
          setPhotos((current) => current.map((item) => item.id === photo.id ? { ...item, state: 'failed' } : item))
          throw reason
        }
      })
      // "Đã gửi" only once every small thumbnail is stored too, so the photo list never shows black tiles.
      await Promise.allSettled(thumbnails)
      if (failures.length) {
        // Other photos were still sent; only the failed ones need a retry.
        const first = failures[0]!.reason
        const detail = first instanceof Error ? ` ${first.message}` : ''
        throw new Error(okCount > 0
          ? `Đã gửi ${okCount}/${pending.length} ảnh. ${failures.length} ảnh chưa gửi được, bấm “Gửi lại ảnh lỗi”.${detail}`
          : `Chưa gửi được ${failures.length} ảnh, bấm “Gửi lại ảnh lỗi”.${detail}`)
      }
      setMessage({ kind: 'success', text: pending.length === 1 ? pending[0]!.photo.file.name : `${photos.length} ảnh` })
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

  const startOver = () => {
    for (const photo of photosRef.current) { if (photo.previewUrl) URL.revokeObjectURL(photo.previewUrl); forgetPhoto(photo.file) }
    setPhotos([])
    setMessage(null)
    submissionIdRef.current = crypto.randomUUID()
    attemptRef.current = 0
  }

  const failedPhotoCount = photos.filter((photo) => photo.state === 'failed').length
  const preparing = photos.some((photo) => photo.state === 'uploading' && !photo.prepared)
  const overallProgress = calculateOverallUploadProgress(photos.map((photo) => ({ size: photo.file.size, uploadedBytes: photo.uploadedBytes })))
  const allSent = photos.length > 0 && photos.every((photo) => photo.state === 'uploaded')
  const phoneState = validPhone ? 'valid' : phone.length && (phoneTouched || phone.replace(/\D/g, '').length >= 10) ? 'error' : phone.length ? 'typing' : 'empty'
  const canSend = !uploading && validPhone && photos.length > 0 && !allSent
  const sendLabel = uploading ? (preparing ? 'Đang chuẩn bị ảnh…' : `Đang gửi… ${overallProgress}%`) : failedPhotoCount > 0 ? (failedPhotoCount === photos.length ? 'Thử gửi lại' : `Gửi lại ${failedPhotoCount} ảnh lỗi`) : photos.length > 1 ? `Gửi ${photos.length} ảnh` : 'Gửi ảnh'
  const hint = uploading ? 'Giữ trang này mở cho tới khi gửi xong.' : failedPhotoCount > 0 ? 'Ảnh và số điện thoại vẫn được giữ, chỉ cần gửi lại.' : !photos.length || !validPhone ? 'Chọn ảnh và nhập số điện thoại để gửi.' : 'Ảnh gửi nguyên bản, không bị nén.'
  const fileInput = <input accept=".png,.jpg,.jpeg,image/png,image/jpeg" aria-label="Chọn ảnh để gửi" className="sr-only" disabled={uploading} multiple onChange={(event) => { addFiles(event.currentTarget.files); event.currentTarget.value = '' }} ref={inputRef} type="file" />
  const stepBadge = (number: number) => <span aria-hidden="true" className="grid size-6 shrink-0 place-items-center rounded-full bg-cs-ink font-mono text-xs font-bold text-white">{number}</span>

  if (message?.kind === 'success' && allSent && !uploading) return <PageShell>
    <AppHeader variant="sub" />
    <section aria-live="polite" className="flex flex-1 flex-col items-center justify-center py-10 text-center">
      <span className="cs-panel grid size-28 place-items-center rounded-full"><span className="cs-lcd grid size-16 place-items-center rounded-full text-cs-led-green"><Icon className="size-7" name="check" /></span></span>
      <h1 className="mt-6 text-[28px] font-black tracking-[-0.035em]">Đã gửi ảnh</h1>
      <p className="mt-2 max-w-[21rem] break-words text-[15px] leading-normal text-cs-ink-2" role="status">Cá Space đã nhận {message.text}. Báo số <strong className="whitespace-nowrap">{formatPhoneDisplay(normalizeVietnamesePhone(phone))}</strong> tại quầy để nhận ảnh in.</p>
      <div className="mt-8 grid w-full gap-2.5"><Button onClick={startOver} variant="chrome">Gửi thêm ảnh khác</Button><a className={buttonClass('primary')} href="/">Về trang chủ</a></div>
    </section>
  </PageShell>

  return <PageShell bottomBar={<BottomBar><Button className="w-full" disabled={!canSend} loading={uploading} onClick={submit}>{sendLabel}</Button><BarHint>{hint}</BarHint></BottomBar>}>
    <AppHeader variant="sub" />
    <p className="cs-mono mt-6 text-[11px] text-cs-red-text">In ảnh chất lượng gốc</p>
    <h1 className="mt-1.5 text-[30px] font-black leading-tight tracking-[-0.035em]">Upload ảnh</h1>
    <p className="mt-2 text-[15px] leading-normal text-cs-ink-2">Gửi ảnh đã ghép khung để Cá Space in với chất lượng gốc.</p>
    {message?.kind === 'error' ? <Alert className="mt-4" icon={/mạng/i.test(message.text) ? 'wifiOff' : 'alert'} kind="error" title="Chưa gửi được ảnh">{message.text}</Alert> : null}
    <section className="cs-panel mt-4 rounded-[28px] px-4 pb-5 pt-5">
      <h2 className="flex items-center gap-2.5 text-[15px] font-extrabold">{stepBadge(1)}Chọn ảnh cần in</h2>
      {photos.length ? <ul className="mt-3 grid gap-2.5">{photos.map((photo) => <li className={`rounded-[20px] border bg-white/90 p-2.5 ${photo.state === 'failed' ? 'border-cs-led ring-1 ring-cs-led' : 'border-cs-chrome-400/70'}`} key={photo.id}>
        <div className="flex min-w-0 items-center gap-3">
          {photo.previewUrl ? <img alt="" className="h-16 w-12 shrink-0 rounded-[10px] bg-cs-chrome-200 object-cover" src={photo.previewUrl} /> : <div aria-hidden className="h-16 w-12 shrink-0 animate-pulse rounded-[10px] bg-cs-chrome-200" />}
          <div className="min-w-0 flex-1"><p className="truncate text-[15px] font-bold">{photo.file.name}</p><p className="mt-0.5 font-mono text-[11px] font-medium text-cs-ink-3">{formatSize(photo.file.size)} · {photo.state === 'uploaded' ? 'Đã gửi' : photo.state === 'failed' ? 'Chưa gửi được' : photo.state === 'uploading' ? (photo.prepared ? `đang gửi ${photo.progress}%` : 'Đang chuẩn bị…') : photo.prepared ? `${formatType(photo.file)} · Sẵn sàng` : 'Đang chuẩn bị…'}</p></div>
          {photo.state === 'uploaded' ? <span className="grid size-11 shrink-0 place-items-center text-cs-green-text"><Icon name="check" /></span> : <button aria-label={`Bỏ ảnh ${photo.file.name}`} className="cs-btn-chrome cs-press grid size-11 shrink-0 place-items-center rounded-full disabled:opacity-40" disabled={uploading} onClick={() => removePhoto(photo.id)} type="button"><Icon className="size-[18px]" name="trash" /></button>}
        </div>
        {photo.state === 'uploading' ? <div aria-label={`Đang gửi ${photo.file.name}`} aria-valuemax={100} aria-valuemin={0} aria-valuenow={photo.progress} className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-cs-chrome-200" role="progressbar"><div className="h-full rounded-full bg-[linear-gradient(90deg,#0D0E10,#FF2D55)] transition-[width]" style={{ width: `${photo.progress}%` }} /></div> : null}
      </li>)}</ul> : null}
      {photos.length < PHOTO_UPLOAD_MAX_FILES ? <button className={photos.length ? buttonClass('chrome', { disabled: uploading, className: 'mt-2.5 min-h-12 w-full' }) : 'mt-3 grid min-h-36 w-full place-items-center rounded-[20px] border-2 border-dashed border-cs-chrome-600 bg-white/50 px-4 py-5 text-center disabled:opacity-50'} disabled={uploading} onClick={() => inputRef.current?.click()} type="button">{photos.length ? <><Icon className="size-[18px]" name="add" />Thêm ảnh</> : <span className="grid justify-items-center gap-2"><span className="cs-btn-primary grid size-11 place-items-center rounded-full"><Icon name="add" /></span><span className="text-base font-extrabold">Chọn ảnh từ máy</span><span className="text-[13px] text-cs-ink-3">PNG hoặc JPG · giữ nguyên chất lượng gốc · tối đa {PHOTO_UPLOAD_MAX_FILES} ảnh</span></span>}</button> : null}
      {fileInput}
      <label className="mt-6 flex items-center gap-2.5 text-[15px] font-extrabold" htmlFor="upload-phone">{stepBadge(2)}Số điện thoại nhận ảnh</label>
      <div className="mt-3"><PhoneInput describedBy={phoneState === 'error' ? 'upload-phone-error' : undefined} disabled={uploading} id="upload-phone" inputRef={phoneRef} onChange={(value) => { setPhone(value); setPhoneTouched(false); if (message?.kind === 'error') setMessage(null) }} onEnter={() => { if (canSend) void submit() }} placeholder="Nhập số điện thoại của bạn" size="md" state={phoneState} value={phone} /></div>
      {phoneState === 'error' ? <p className="mt-2 flex gap-1.5 text-[13px] font-semibold text-cs-red-text" id="upload-phone-error"><Icon className="mt-px size-4 shrink-0" name="alert" />Vui lòng nhập đúng số điện thoại Việt Nam.</p> : null}
      {uploading ? <div className="mt-5" aria-live="polite"><div className="flex justify-between text-sm font-bold"><span>{preparing || overallProgress === 0 ? 'Đang chuẩn bị ảnh…' : 'Đang gửi ảnh…'}</span><span className="font-mono">{overallProgress}%</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-cs-chrome-200"><div className="h-full rounded-full bg-[linear-gradient(90deg,#0D0E10,#FF2D55)] transition-[width]" style={{ width: `${overallProgress}%` }} /></div></div> : null}
    </section>
  </PageShell>
}
