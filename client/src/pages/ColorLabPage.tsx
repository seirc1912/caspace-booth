import { useEffect, useRef, useState } from 'react'
import { BrandMark } from '../components/branding/BrandMark'
import { PageShell } from '../components/layout/PageShell'
import { canvasToBlob, deliverColorLabImage, renderColorLabImage } from '../features/colorLab/export'
import { colorLabPresets, type ColorLabPresetId } from '../features/colorLab/presets'
import { requireSafeDimensions } from '../features/colorLab/dimensions'
import { loadPhotoFile } from '../features/photos/imageLoader'
import type { PhotoAsset } from '../types/selfBooth'

interface LoadedColorLabPhoto {
  asset: PhotoAsset
  previewImage: HTMLImageElement
  exportImage: HTMLImageElement
  width: number
  height: number
  seed: number
  outputType: 'image/png' | 'image/jpeg'
}

function decodeImage(src: string, stage: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      try { requireSafeDimensions(image.naturalWidth, image.naturalHeight, stage); resolve(image) }
      catch (reason) { reject(reason) }
    }
    image.onerror = () => reject(new Error('This photo could not be decoded.'))
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
  const renderSequence = useRef(0)
  const [photo, setPhoto] = useState<LoadedColorLabPhoto | null>(null)
  const [presetId, setPresetId] = useState<ColorLabPresetId>('original')
  const [intensity, setIntensity] = useState(100)
  const [showOriginal, setShowOriginal] = useState(false)
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
      const next: LoadedColorLabPhoto = { asset, previewImage, exportImage, width: exportDimensions.width, height: exportDimensions.height, seed: seedForAsset(asset), outputType: file.type === 'image/png' || /\.png$/i.test(file.name) ? 'image/png' : 'image/jpeg' }
      setPhoto((current) => {
        if (current) { URL.revokeObjectURL(current.asset.src); if (current.asset.previewSrc) URL.revokeObjectURL(current.asset.previewSrc) }
        return next
      })
      setPresetId('original'); setIntensity(100); setThumbnails({})
    } catch (reason) {
      console.warn('[color-lab] image preparation failed', { stage: 'decode-or-dimensions', fileType: file.type || 'unknown', message: reason instanceof Error ? reason.message : String(reason) })
      setError(reason instanceof Error ? reason.message : 'This photo could not be opened.')
    }
    finally { setProcessing(false) }
  }

  useEffect(() => () => {
    if (photo) { URL.revokeObjectURL(photo.asset.src); if (photo.asset.previewSrc) URL.revokeObjectURL(photo.asset.previewSrc) }
  }, [photo])

  useEffect(() => {
    if (!photo || !previewRef.current) return
    const sequence = ++renderSequence.current
    const timer = window.setTimeout(() => {
      void renderColorLabImage(photo.previewImage, photo.previewImage.naturalWidth, photo.previewImage.naturalHeight, showOriginal ? 'original' : presetId, showOriginal ? 0 : intensity, photo.seed, 1600).then((rendered) => {
        if (sequence !== renderSequence.current || !previewRef.current) return
        const canvas = previewRef.current
        canvas.width = rendered.width; canvas.height = rendered.height
        const context = canvas.getContext('2d')
        context?.drawImage(rendered, 0, 0)
        rendered.width = 1; rendered.height = 1
      }).catch((reason) => setError(reason instanceof Error ? reason.message : 'Preview could not be rendered.'))
    }, 20)
    return () => window.clearTimeout(timer)
  }, [photo, presetId, intensity, showOriginal])

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
      const canvas = await renderColorLabImage(photo.exportImage, photo.width, photo.height, presetId, intensity, photo.seed, 4096)
      const blob = await canvasToBlob(canvas, photo.outputType, 0.96)
      canvas.width = 1; canvas.height = 1
      await deliverColorLabImage(blob, `ca-color-lab-${presetId}.${photo.outputType === 'image/png' ? 'png' : 'jpg'}`)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Download HD could not be completed.') }
    finally { setExporting(false) }
  }

  return <PageShell className="bg-[#f3eee7]">
    <header className="flex items-center justify-between gap-4"><a className="min-h-11 rounded-full bg-white px-4 py-3 text-sm font-bold shadow-sm" href="/">← Back</a><BrandMark compact /><span className="w-[4.5rem]" /></header>
    <section className="mx-auto mt-7 w-full max-w-3xl">
      <div className="text-center"><p className="text-xs font-black uppercase tracking-[0.24em] text-rose-700">Cá Space presents</p><h1 className="mt-2 text-4xl font-black tracking-[-0.05em]">Cá Color Lab</h1><p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-stone-600">Film-inspired color for your own photos, processed privately on this device.</p></div>
      {!photo ? <div className="mx-auto mt-8 grid min-h-[28rem] max-w-xl place-items-center rounded-[2rem] border border-stone-200 bg-white p-8 text-center shadow-sm"><div><div className="mx-auto grid size-20 place-items-center rounded-full bg-rose-50 text-3xl">✦</div><h2 className="mt-5 text-2xl font-black">Bring a photo to the Lab</h2><p className="mt-2 text-sm leading-6 text-stone-500">Choose one photo. It stays on your device and is never uploaded.</p><button className="mt-6 min-h-14 rounded-2xl bg-stone-950 px-8 font-black text-white" disabled={processing} onClick={() => inputRef.current?.click()} type="button">{processing ? 'Preparing Photo…' : 'Choose Photo'}</button></div></div> : <>
        <div className="mt-6 grid min-h-64 place-items-center overflow-hidden rounded-[1.75rem] bg-stone-950 shadow-xl"><canvas aria-label={showOriginal ? 'Original photo preview' : `${colorLabPresets.find((preset) => preset.id === presetId)?.name} preview`} className="block h-auto max-h-[62dvh] max-w-full touch-pan-y" onPointerCancel={() => setShowOriginal(false)} onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); setShowOriginal(true) }} onPointerLeave={() => setShowOriginal(false)} onPointerUp={() => setShowOriginal(false)} ref={previewRef} /></div>
        <div className="mt-3 flex items-center justify-between"><button className="min-h-11 rounded-full bg-white px-4 text-sm font-bold shadow-sm" onClick={() => inputRef.current?.click()} type="button">Choose Another</button><span className="rounded-full bg-stone-900 px-3 py-1.5 text-xs font-bold text-white">{showOriginal ? 'Original' : colorLabPresets.find((preset) => preset.id === presetId)?.name}</span></div>
        <div aria-label="Film presets" className="mt-6 flex snap-x gap-3 overflow-x-auto pb-3">
          {colorLabPresets.map((preset) => <button aria-pressed={presetId === preset.id} className={`w-24 shrink-0 snap-start overflow-hidden rounded-2xl border-2 bg-white text-left transition ${presetId === preset.id ? 'border-stone-950 shadow-md' : 'border-transparent'}`} key={preset.id} onClick={() => setPresetId(preset.id)} type="button"><div className="aspect-square bg-stone-200">{thumbnails[preset.id] ? <img alt="" className="size-full object-cover" src={thumbnails[preset.id]} /> : null}</div><span className="block min-h-12 px-2 py-2 text-center text-[0.68rem] font-black leading-tight">{preset.name}</span></button>)}
        </div>
        <div className="mt-4 rounded-[1.75rem] bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><label className="font-black" htmlFor="color-lab-intensity">Intensity</label><output className="font-black tabular-nums">{presetId === 'original' ? 0 : intensity}%</output></div><input className="mt-4 h-10 w-full accent-stone-950" disabled={presetId === 'original'} id="color-lab-intensity" max="100" min="0" onChange={(event) => setIntensity(Number(event.target.value))} type="range" value={presetId === 'original' ? 0 : intensity} /><p className="mt-2 text-center text-xs font-semibold text-stone-400">Press and hold the photo to see Before</p></div>
        <button className="mt-4 min-h-16 w-full rounded-2xl bg-stone-950 px-6 text-lg font-black text-white shadow-lg disabled:opacity-50" disabled={exporting} onClick={downloadHd} type="button">{exporting ? 'Processing HD…' : 'Download HD'}</button>
      </>}
      <input accept="image/*" aria-label="Choose photo for Color Lab" className="sr-only" onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; void choosePhoto(file) }} ref={inputRef} type="file" />
      {error ? <div className="fixed inset-x-4 top-4 z-50 mx-auto flex max-w-md items-center justify-between gap-3 rounded-2xl bg-rose-700 px-4 py-3 text-sm font-bold text-white shadow-xl" role="alert"><span>{error}</span><button className="min-h-10 rounded-xl bg-white/15 px-3" onClick={() => setError(null)} type="button">Dismiss</button></div> : null}
    </section>
  </PageShell>
}
