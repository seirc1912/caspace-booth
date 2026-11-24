import { useEffect, useRef, useState } from 'react'
import { Alert } from '../components/chrome/Alert'
import { AppHeader } from '../components/chrome/AppHeader'
import { BarHint, BottomBar } from '../components/chrome/BottomBar'
import { Button } from '../components/chrome/Button'
import { PageShell } from '../components/layout/PageShell'
import { Icon } from '../components/ui/Icon'
import { canvasToBlob, deliverColorLabImage, renderColorLabImage } from '../features/colorLab/export'
import { colorLabPresets, type ColorLabPresetId } from '../features/colorLab/presets'
import { requireSafeDimensions } from '../features/colorLab/dimensions'
import { ColorLabPreviewClient, preparePreviewPixels } from '../features/colorLab/previewClient'
import { loadPhotoFile } from '../features/photos/imageLoader'
import type { PhotoAsset } from '../types/selfBooth'

interface LoadedColorLabPhoto {
  asset: PhotoAsset
  previewImage: HTMLImageElement
  previewPixels: Uint8ClampedArray
  previewWidth: number
  previewHeight: number
  exportImage: HTMLImageElement
  width: number
  height: number
  seed: number
  outputType: 'image/png' | 'image/jpeg'
  fileName: string
}

/** "Original" is the untouched photo; the film presets keep their own names. */
const presetLabel = (preset: { id: ColorLabPresetId; name: string }) => preset.id === 'original' ? 'Gốc' : preset.name

/** Illustrated before/after sample for the empty state (no photo leaves the device). */
function SampleCompare() {
  const [split, setSplit] = useState(50)
  const scene = <svg aria-hidden="true" className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid slice" viewBox="0 0 300 240">
    <defs><linearGradient id="cl-sky" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#7FB3E6" /><stop offset="0.7" stopColor="#F4C9A8" /></linearGradient></defs>
    <rect fill="url(#cl-sky)" height="240" width="300" />
    <circle cx="210" cy="92" fill="#FFE7A3" r="26" />
    <path d="M0 160 Q60 110 120 150 T240 140 T300 150 V240 H0Z" fill="#5E8C6A" />
    <path d="M0 190 Q90 150 170 185 T300 180 V240 H0Z" fill="#3F6B4E" />
    <path d="M118 240 V178 Q118 150 140 150 Q162 150 162 178 V240Z" fill="#E8A0B4" />
    <circle cx="140" cy="136" fill="#F1C7A5" r="14" />
    <path d="M124 132 Q140 104 156 132 Q150 120 140 120 Q130 120 124 132Z" fill="#2B2320" />
  </svg>
  return <div className="relative aspect-[5/4] overflow-hidden rounded-[16px]">
    {scene}
    <div className="absolute inset-0 [filter:sepia(.55)_saturate(1.35)_contrast(1.06)_brightness(1.04)_hue-rotate(-10deg)]" style={{ clipPath: `inset(0 0 0 ${split}%)` }}>{scene}</div>
    <span aria-hidden="true" className="absolute inset-y-0 w-0.5 bg-white" style={{ left: `${split}%` }} />
    <span aria-hidden="true" className="cs-btn-chrome absolute top-1/2 grid size-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full" style={{ left: `${split}%` }}><Icon className="size-4" name="moveX" /></span>
    <span className="cs-mono absolute left-2.5 top-2.5 rounded-full bg-cs-ink/80 px-2.5 py-1 text-[10px] text-white">Trước</span>
    <span className="cs-mono absolute right-2.5 top-2.5 rounded-full bg-cs-led px-2.5 py-1 text-[10px] text-cs-ink">Sau · Golden Vintage</span>
    <input aria-label="Kéo để so sánh trước và sau" className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0" max={95} min={5} onChange={(event) => setSplit(Number(event.target.value))} type="range" value={split} />
  </div>
}

function decodeImage(src: string, stage: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      try { requireSafeDimensions(image.naturalWidth, image.naturalHeight, stage); resolve(image) }
      catch (reason) { reject(reason) }
    }
    image.onerror = () => reject(new Error('Không đọc được ảnh này.'))
    image.src = src
  })
}

function seedForAsset(asset: PhotoAsset) {
  let seed = 2166136261
  for (const character of asset.id) seed = Math.imul(seed ^ character.charCodeAt(0), 16777619)
  return seed >>> 0
}

export function ColorLabPage() {
  const inputRef = useRef<HTMLInputElement>(null)
  const previewRef = useRef<HTMLCanvasElement>(null)
  const previewClientRef = useRef<ColorLabPreviewClient | null>(null)
  const renderSequence = useRef(0)
  const [photo, setPhoto] = useState<LoadedColorLabPhoto | null>(null)
  const [presetId, setPresetId] = useState<ColorLabPresetId>('original')
  const [intensity, setIntensity] = useState(100)
  const [showOriginal, setShowOriginal] = useState(false)
  const [grainEnabled, setGrainEnabled] = useState(false)
  const [dustEnabled, setDustEnabled] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [thumbnails, setThumbnails] = useState<Partial<Record<ColorLabPresetId, string>>>({})

  const choosePhoto = async (file?: File) => {
    if (!file) return
    setProcessing(true); setError(null)
    try {
      const asset = await loadPhotoFile(file)
      const [previewImage, exportImage] = await Promise.all([decodeImage(asset.previewSrc ?? asset.src, 'preview source'), decodeImage(asset.src, 'HD source')])
      const exportDimensions = requireSafeDimensions(exportImage.naturalWidth, exportImage.naturalHeight, 'HD source')
      requireSafeDimensions(previewImage.naturalWidth, previewImage.naturalHeight, 'preview source')
      const preview = preparePreviewPixels(previewImage, previewImage.naturalWidth, previewImage.naturalHeight)
      const next: LoadedColorLabPhoto = { asset, previewImage, previewPixels: preview.data, previewWidth: preview.width, previewHeight: preview.height, exportImage, width: exportDimensions.width, height: exportDimensions.height, seed: seedForAsset(asset), outputType: file.type === 'image/png' || /\.png$/i.test(file.name) ? 'image/png' : 'image/jpeg', fileName: file.name }
      setPhoto((current) => {
        if (current) { URL.revokeObjectURL(current.asset.src); if (current.asset.previewSrc) URL.revokeObjectURL(current.asset.previewSrc) }
        return next
      })
      setPresetId('original'); setIntensity(100); setThumbnails({})
    } catch (reason) {
      console.warn('[color-lab] image preparation failed', { stage: 'decode-or-dimensions', fileType: file.type || 'unknown', message: reason instanceof Error ? reason.message : String(reason) })
      setError('Không mở được ảnh này. Hãy thử một ảnh JPG hoặc PNG khác.')
    }
    finally { setProcessing(false) }
  }

  useEffect(() => () => {
    if (photo) { URL.revokeObjectURL(photo.asset.src); if (photo.asset.previewSrc) URL.revokeObjectURL(photo.asset.previewSrc) }
  }, [photo])

  useEffect(() => {
    if (!photo) return
    const client = new ColorLabPreviewClient(photo.asset.id, photo.previewWidth, photo.previewHeight, photo.seed, photo.previewPixels)
    previewClientRef.current = client
    return () => { if (previewClientRef.current === client) previewClientRef.current = null; client.dispose() }
  }, [photo])

  useEffect(() => {
    if (!photo || !previewRef.current) return
    const sequence = ++renderSequence.current
    const frame = window.requestAnimationFrame(() => {
      const client = previewClientRef.current
      if (!client) return
      void client.render({ presetId: showOriginal ? 'original' : presetId, intensity: showOriginal ? 0 : intensity, effects: showOriginal ? { grain: false, dust: false } : { grain: grainEnabled, dust: dustEnabled } }).then((rendered) => {
        if (!rendered || sequence !== renderSequence.current || !previewRef.current) return
        const canvas = previewRef.current
        canvas.width = rendered.width; canvas.height = rendered.height
        const context = canvas.getContext('2d')
        if (!context) return
        const imageData = context.createImageData(rendered.width, rendered.height)
        imageData.data.set(rendered.data)
        context.putImageData(imageData, 0, 0)
      }).catch((reason) => { console.warn('[color-lab] preview failed', reason); setError('Không hiển thị được bản xem trước. Vui lòng thử lại.') })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [photo, presetId, intensity, showOriginal, grainEnabled, dustEnabled])

  useEffect(() => {
    if (!photo) return
    let active = true
    const generate = async () => {
      for (const preset of colorLabPresets) {
        const canvas = await renderColorLabImage(photo.previewImage, photo.previewImage.naturalWidth, photo.previewImage.naturalHeight, preset.id, 100, photo.seed, 180)
        const url = canvas.toDataURL('image/jpeg', 0.72)
        canvas.width = 1; canvas.height = 1
        if (!active) return
        setThumbnails((current) => ({ ...current, [preset.id]: url }))
        await new Promise<void>((resolve) => window.setTimeout(resolve, 0))
      }
    }
    void generate().catch(() => undefined)
    return () => { active = false }
  }, [photo])

  const downloadHd = async () => {
    if (!photo || exporting) return
    setExporting(true); setError(null)
    try {
      const canvas = await renderColorLabImage(photo.exportImage, photo.width, photo.height, presetId, intensity, photo.seed, 4096, { grain: grainEnabled, dust: dustEnabled })
      const blob = await canvasToBlob(canvas, photo.outputType, 0.96)
      canvas.width = 1; canvas.height = 1
      await deliverColorLabImage(blob, `ca-color-lab-${presetId}.${photo.outputType === 'image/png' ? 'png' : 'jpg'}`)
    } catch (reason) { console.warn('[color-lab] export failed', reason); setError('Không lưu được ảnh. Vui lòng thử lại.') }
    finally { setExporting(false) }
  }

  const currentPreset = colorLabPresets.find((preset) => preset.id === presetId) ?? colorLabPresets[0]!
  const openPicker = () => inputRef.current?.click()
  const fileInput = <input accept="image/*" aria-label="Chọn ảnh để chỉnh màu" className="sr-only" onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; void choosePhoto(file) }} ref={inputRef} type="file" />
  const errorAlert = error ? <div className="mt-4"><Alert kind="error"><span className="flex items-start justify-between gap-2"><span>{error}</span><button className="-my-2 min-h-11 shrink-0 px-1 font-bold underline" onClick={() => setError(null)} type="button">Đóng</button></span></Alert></div> : null

  if (!photo) return <PageShell bottomBar={<BottomBar><Button className="w-full" icon={<Icon name="image" />} loading={processing} onClick={openPicker}>{processing ? 'Đang mở ảnh…' : 'Chọn ảnh để chỉnh'}</Button><BarHint><span className="inline-flex items-center gap-1.5"><Icon className="size-4" name="lock" />Ảnh ở lại trên máy bạn, không tải lên</span></BarHint></BottomBar>}>
    <AppHeader variant="sub" />
    <p className="cs-mono mt-6 text-[11px] text-cs-red-text">Cá Space giới thiệu</p>
    <h1 className="mt-1.5 text-[30px] font-black leading-tight tracking-[-0.035em]">Cá Color Lab</h1>
    <p className="mt-2 text-[15px] leading-normal text-cs-ink-2">Chỉnh màu kiểu film cho ảnh của bạn. Ảnh xử lý ngay trên máy, không tải lên.</p>
    {errorAlert}
    <section aria-label="Ví dụ trước và sau" className="cs-lcd mt-5 rounded-[28px] p-3.5">
      <SampleCompare />
      <p className="cs-mono mt-3.5 text-[10px] text-white/70">{colorLabPresets.length - 1} màu film</p>
      <ul className="mt-2 flex flex-wrap gap-2">{colorLabPresets.filter((preset) => preset.id !== 'original').map((preset) => <li className="rounded-full border border-white/25 px-3 py-1.5 text-[13px] font-semibold" key={preset.id}>{preset.name}</li>)}</ul>
    </section>
    {fileInput}
  </PageShell>

  return <PageShell bottomBar={<BottomBar><div className="grid grid-cols-[minmax(0,0.75fr)_minmax(0,1.6fr)] gap-2.5"><Button disabled={exporting} loading={processing} onClick={openPicker} variant="chrome">Ảnh khác</Button><Button icon={<Icon name="download" />} loading={exporting} onClick={downloadHd}>{exporting ? 'Đang xử lý ảnh HD…' : 'Lưu ảnh về máy'}</Button></div></BottomBar>}>
    <AppHeader variant="sub" />
    <div className="mt-5 flex items-end justify-between gap-3"><h1 className="text-[22px] font-black tracking-[-0.03em]">Cá Color Lab</h1><span className="cs-mono min-w-0 truncate pb-1 text-[11px] text-cs-ink-2">{photo.fileName}</span></div>
    {errorAlert}
    <div className="cs-lcd relative mt-3 grid min-h-64 place-items-center overflow-hidden rounded-[28px] p-2">
      <canvas aria-label={showOriginal ? 'Ảnh gốc' : `Ảnh với màu ${presetLabel(currentPreset)}`} className="block h-auto max-h-[58dvh] max-w-full touch-pan-y rounded-[14px]" onContextMenu={(event) => event.preventDefault()} onPointerCancel={() => setShowOriginal(false)} onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); setShowOriginal(true) }} onPointerLeave={() => setShowOriginal(false)} onPointerUp={() => setShowOriginal(false)} ref={previewRef} />
      <span className="cs-mono absolute left-4 top-4 rounded-full bg-cs-ink/80 px-2.5 py-1 text-[11px] normal-case tracking-normal text-white">{showOriginal ? 'Ảnh gốc' : presetId === 'original' ? 'Gốc' : `${currentPreset.name} · ${intensity}%`}</span>
    </div>
    <p className="mt-2 text-center text-[13px] text-cs-ink-2">Giữ ngón tay trên ảnh để xem ảnh gốc</p>
    <section className="cs-panel mt-3 rounded-[28px] px-3 py-4">
      <div aria-label="Màu film" className="-mx-1 flex snap-x gap-2.5 overflow-x-auto px-1 pb-1" role="radiogroup">
        {colorLabPresets.map((preset) => <button aria-checked={presetId === preset.id} className="w-[4.5rem] shrink-0 snap-start text-center" key={preset.id} onClick={() => setPresetId(preset.id)} role="radio" type="button">
          <span className={`block aspect-square overflow-hidden rounded-[14px] border bg-cs-chrome-200 ${presetId === preset.id ? 'border-transparent ring-[3px] ring-cs-led' : 'border-cs-chrome-400'}`}>{thumbnails[preset.id] ? <img alt="" className="size-full object-cover" src={thumbnails[preset.id]} /> : null}</span>
          <span className="mt-1.5 block min-h-8 text-[12px] font-bold leading-tight">{presetLabel(preset)}</span>
        </button>)}
      </div>
      <div className="mt-3 flex items-center gap-3 px-1"><label className="shrink-0 text-sm font-bold" htmlFor="color-lab-intensity">Cường độ</label><input className="h-11 min-w-0 flex-1 accent-cs-ink disabled:opacity-40" disabled={presetId === 'original'} id="color-lab-intensity" max="100" min="0" onChange={(event) => setIntensity(Number(event.target.value))} type="range" value={presetId === 'original' ? 0 : intensity} /><output className="w-9 text-right font-mono text-sm font-bold tabular-nums" htmlFor="color-lab-intensity">{presetId === 'original' ? 0 : intensity}</output></div>
      <div aria-label="Hiệu ứng" className="mt-2 grid grid-cols-2 gap-2 px-1" role="group">
        <button aria-pressed={grainEnabled} className={`cs-press min-h-11 rounded-full px-4 text-sm font-bold ${grainEnabled ? 'cs-btn-primary' : 'cs-btn-chrome'}`} onClick={() => setGrainEnabled((enabled) => !enabled)} type="button">Hạt film</button>
        <button aria-pressed={dustEnabled} className={`cs-press min-h-11 rounded-full px-4 text-sm font-bold ${dustEnabled ? 'cs-btn-primary' : 'cs-btn-chrome'}`} onClick={() => setDustEnabled((enabled) => !enabled)} type="button">Bụi film</button>
      </div>
    </section>
    {fileInput}
  </PageShell>
}
