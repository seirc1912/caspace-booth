import { useEffect, useRef, useState } from 'react'
import { EditorErrorBoundary } from './components/editor/EditorErrorBoundary'
import { useBranding } from './contexts/BrandingContext'
import type { PrintOrderDraft, PrintOrderItem } from './features/orders/repositories/PrintOrderRepository'
import { downloadComposition } from './features/orders/services/downloadComposition'
import { printOrderRepository } from './features/orders/services/orderServiceInstance'
import { compositionAssetSources, RenderAssetCache, renderComposition, type RenderTiming } from './features/orders/services/renderComposition'
import { isValidPhoneNumber } from './features/orders/phoneNumber'
import { usePathname } from './hooks/usePathname'
import { useSelfBooth } from './hooks/useSelfBooth'
import { startPhotoLibrarySession, useSessionPhotos } from './features/photos/useSessionPhotos'
import type { PhotoLibrarySession } from './features/photos/useSessionPhotos'
import type { FilledSlot } from './types/selfBooth'
import { ComposerPage } from './pages/ComposerPage'
import { HomePage } from './pages/HomePage'
import { NotFoundPage } from './pages/NotFoundPage'
import { OrderPreviewPage } from './pages/OrderPreviewPage'
import { RoomSelectionPage } from './pages/RoomSelectionPage'
import { RoomSummaryPage } from './pages/RoomSummaryPage'
import { SuccessPage } from './pages/SuccessPage'
import { TemplateSelectionPage } from './pages/TemplateSelectionPage'

export function CustomerApp() {
  const booth = useSelfBooth(); const branding = useBranding(); const { pathname, navigate } = usePathname()
  const [orderId, setOrderId] = useState(() => sessionStorage.getItem('selfbooth.last-order-id') ?? '')
  const [downloading, setDownloading] = useState(false)
  const processingOrder = useRef(false)
  const [orderProgress, setOrderProgress] = useState<string | null>(null)
  const [framePreviews, setFramePreviews] = useState<Record<string, string>>({})
  const [orderDraft, setOrderDraft] = useState<PrintOrderDraft | null>(null)
  const [orderItems, setOrderItems] = useState<Record<string, PrintOrderItem>>({})
  const orderDraftRef = useRef<PrintOrderDraft | null>(null)
  const orderItemsRef = useRef<Record<string, PrintOrderItem>>({})
  const uploadedFrameSlotsRef = useRef<Record<string, Array<FilledSlot | null>>>({})
  const debugOrderTiming = import.meta.env.DEV || sessionStorage.getItem('selfbooth.debug-order-timing') === '1'
  const [customerSession, setCustomerSession] = useState<PhotoLibrarySession | null>(() => {
    try {
      return JSON.parse(sessionStorage.getItem('selfbooth.photo-library-session') ?? 'null') as PhotoLibrarySession | null
    } catch { return null }
  })

  useSessionPhotos(customerSession, booth.addUploadedAssets, booth.reportPhotoError, booth.clearPhotoError)

  const roomFrames = booth.roomTemplates.map((template, index) => ({
    template,
    index,
    slots: template.id === booth.template.id ? booth.slots : booth.frameSlots[template.id] ?? template.slots.map(() => null),
  }))
  const readyFrameCount = roomFrames.filter((frame) => frame.slots.length === frame.template.slots.length && frame.slots.every(Boolean)).length
  const requiredFrameCount = booth.roomTemplateSummaries.length
  const canOrder = requiredFrameCount > 0 && roomFrames.length === requiredFrameCount && readyFrameCount === requiredFrameCount
  const incompleteOrderMessage = `Please complete all frames. ${readyFrameCount} of ${requiredFrameCount} frames are ready.`

  const enterRoom = async (boothId: string) => {
    booth.resetSessionPhotos()
    try { await booth.selectRoom(boothId) }
    catch (reason) { booth.reportPhotoError(reason instanceof Error ? reason.message : 'Unable to load this Room’s first frame.'); return }
    if (orderDraftRef.current) printOrderRepository.releaseDraft(orderDraftRef.current)
    orderDraftRef.current = null; orderItemsRef.current = {}; uploadedFrameSlotsRef.current = {}
    setOrderDraft(null); setOrderItems({}); setFramePreviews({}); navigate('/editor')
    void startPhotoLibrarySession(boothId, booth.phoneNumber).then((session) => {
      sessionStorage.setItem('selfbooth.photo-library-session', JSON.stringify(session))
      setCustomerSession(session)
    }).catch((error) => booth.reportPhotoError(error instanceof Error ? error.message : 'Unable to start customer session'))
  }

  const downloadCurrentFrame = async () => {
    if (downloading) return
    setDownloading(true)
    try { await downloadComposition({ branding, slots: booth.slots, template: booth.template }) }
    catch (reason) { booth.reportPhotoError(reason instanceof Error ? reason.message : 'Unable to download this frame.') }
    finally { setDownloading(false) }
  }

  const saveAndContinue = async () => {
    if (!booth.room || processingOrder.current) return
    if (!canOrder) { booth.reportPhotoError(incompleteOrderMessage); return }
    processingOrder.current = true
    setDownloading(true)
    const orderStartedAt = performance.now()
    const orderTimings: Array<{ frame: number; render: RenderTiming; uploadMs: number; itemRpcMs: number }> = []
    const assetCache = new RenderAssetCache()
    try {
      setOrderProgress('Creating print order…')
      const draftStartedAt = performance.now()
      const draft = orderDraftRef.current ?? await printOrderRepository.createDraft(booth.phoneNumber, booth.room.id)
      const draftMs = performance.now() - draftStartedAt
      if (!orderDraftRef.current) { orderDraftRef.current = draft; setOrderDraft(draft) }
      const populatedIds = new Set(roomFrames.map((frame) => frame.template.id))
      for (const [templateId, item] of Object.entries(orderItemsRef.current)) {
        if (!populatedIds.has(templateId)) await printOrderRepository.removeItem(draft, item)
      }
      const pendingFrames = roomFrames.filter((frame) => !orderItemsRef.current[frame.template.id] || uploadedFrameSlotsRef.current[frame.template.id] !== frame.slots)
      let completed = roomFrames.length - pendingFrames.length
      const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
      const networkConcurrency = mobile ? 1 : 2
      const activeUploads = new Set<Promise<void>>()
      try {
        for (let pendingIndex = 0; pendingIndex < pendingFrames.length; pendingIndex += 1) {
          const frame = pendingFrames[pendingIndex]!
          if (activeUploads.size >= networkConcurrency) await Promise.race(activeUploads)
          setOrderProgress(`Preparing prints ${completed + 1}/${roomFrames.length}…`)
          let timing: RenderTiming | undefined
          let rendered
          try { rendered = await renderComposition(frame.template, frame.slots, { branding, createPreview: false, assetCache, onTiming: (value) => { timing = value } }) }
          catch (reason) { throw new Error(`Failed to render print image: ${reason instanceof Error ? reason.message : String(reason)}`, { cause: reason }) }
          const nextFrame = pendingFrames[pendingIndex + 1]
          assetCache.retainOnly(nextFrame ? compositionAssetSources(nextFrame.template, nextFrame.slots, branding) : [])
          setOrderProgress(`Uploading prints ${completed + 1}/${roomFrames.length}…`)
          const upload = (async () => {
            let networkTiming: { uploadMs: number; itemRpcMs: number } | undefined
            const item = await printOrderRepository.addItem(draft, booth.phoneNumber, frame.template.id, rendered.print, frame.index, (value) => { networkTiming = value })
            orderItemsRef.current = { ...orderItemsRef.current, [frame.template.id]: item }
            uploadedFrameSlotsRef.current = { ...uploadedFrameSlotsRef.current, [frame.template.id]: frame.slots }
            setOrderItems(orderItemsRef.current)
            completed += 1
            if (timing && networkTiming) orderTimings.push({ frame: frame.index + 1, render: timing, ...networkTiming })
          })()
          activeUploads.add(upload)
          void upload.then(() => activeUploads.delete(upload), () => activeUploads.delete(upload))
        }
        await Promise.all(activeUploads)
      } catch (reason) {
        await Promise.allSettled(activeUploads)
        throw reason
      }
      setOrderProgress('Finalizing order…')
      const submitStartedAt = performance.now()
      const submitted = await printOrderRepository.submit(draft)
      const submitMs = performance.now() - submitStartedAt
      printOrderRepository.releaseDraft(draft)
      if (debugOrderTiming) console.info('[print-order timing]', { draftMs, frames: orderTimings.sort((left, right) => left.frame - right.frame), submitMs, totalMs: performance.now() - orderStartedAt, concurrency: { render: 1, network: networkConcurrency } })
      sessionStorage.setItem('selfbooth.last-order-id', submitted.id)
      setOrderId(submitted.id)
      navigate('/success')
    } catch (reason) { booth.reportPhotoError(reason instanceof Error ? reason.message : 'Unable to add this image to the Print Order.') }
    finally { assetCache.clear(); processingOrder.current = false; setDownloading(false); setOrderProgress(null) }
  }

  const removeOrderItem = async (templateId: string) => {
    const item = orderItems[templateId]
    if (!orderDraft || !item) return
    await printOrderRepository.removeItem(orderDraft, item)
    delete orderItemsRef.current[templateId]
    delete uploadedFrameSlotsRef.current[templateId]
    setOrderItems((current) => { const next = { ...current }; delete next[templateId]; return next })
    setFramePreviews((current) => { const next = { ...current }; if (next[templateId]) URL.revokeObjectURL(next[templateId]); delete next[templateId]; return next })
    booth.uncompleteFrame(templateId)
  }

  const submitOrder = async () => {
    if (!canOrder) throw new Error(incompleteOrderMessage)
    if (!orderDraft) throw new Error('Add at least one image to the Print Order.')
    return (await printOrderRepository.submit(orderDraft)).id
  }

  useEffect(() => { if (pathname === '/editor' && booth.templateReady && booth.slots.length === 0) booth.openEditor() }, [booth, pathname])

  if (pathname === '/') return <HomePage onContinue={(phoneNumber) => { booth.setPhoneNumber(phoneNumber); navigate('/rooms') }} phoneNumber={booth.phoneNumber} />
  if (pathname === '/rooms') return isValidPhoneNumber(booth.phoneNumber) ? <RoomSelectionPage error={booth.roomsError} loading={booth.roomsLoading} onBack={() => navigate('/')} onSelect={enterRoom} rooms={booth.rooms} templateCount={(roomId) => booth.templates.filter((template) => template.roomId === roomId).length} /> : <HomePage onContinue={(phoneNumber) => { booth.setPhoneNumber(phoneNumber); navigate('/rooms') }} phoneNumber={booth.phoneNumber} />
  if (pathname === '/templates' && booth.room) return <TemplateSelectionPage onBack={() => navigate('/rooms')} onContinue={() => { booth.openEditor(); navigate('/editor') }} onSelect={booth.selectTemplate} roomName={booth.room.name} selectedTemplateId={booth.selectedTemplateId} templates={booth.roomTemplates} />
  if (pathname === '/editor' && booth.selectedTemplateId && booth.templateReady) return <EditorErrorBoundary onError={booth.reportPhotoError}><ComposerPage canOrder={canOrder} completedFrameIds={booth.completedFrameIds} currentSlot={booth.currentSlot} downloading={downloading} frameCount={requiredFrameCount} frameIds={booth.roomTemplateSummaries.map((template) => template.id)} frameIndex={booth.currentFrameIndex} onBack={() => navigate('/rooms')} onCurrentSlotChange={booth.setCurrentSlot} onDownload={downloadCurrentFrame} onFillEmpty={booth.fillEmpty} onNext={saveAndContinue} onPickPhoto={booth.addPhotoToTarget} onPrevious={() => booth.selectFrame(booth.currentFrameIndex - 1)} onRemove={booth.removeSlot} onSave={booth.completeCurrentFrame} onSelectFrame={booth.selectFrame} onShuffle={booth.shuffleSlots} onTransform={booth.updateTransform} onFitChange={booth.updateFit} orderProgress={orderProgress} slots={booth.slots} template={booth.template} uploadedPhotos={booth.uploadedPhotos} photoError={booth.photoError} onClearPhotoError={booth.clearPhotoError} onPhotoError={booth.reportPhotoError} /></EditorErrorBoundary>
  if (pathname === '/summary' && booth.room) return <RoomSummaryPage completedFrameIds={booth.completedFrameIds} frameSlots={booth.frameSlots} onEdit={(index) => { booth.selectFrame(index); navigate('/editor') }} onRemove={removeOrderItem} onSubmit={submitOrder} onSuccess={(id) => { sessionStorage.setItem('selfbooth.last-order-id', id); setOrderId(id); navigate('/success') }} previewUrls={framePreviews} roomName={booth.room.name} templates={booth.roomTemplates} />
  if (pathname === '/preview' && booth.room) return <OrderPreviewPage onBack={() => navigate('/editor')} onSuccess={(id) => { sessionStorage.setItem('selfbooth.last-order-id', id); setOrderId(id); navigate('/success') }} phoneNumber={booth.phoneNumber} roomId={booth.room.id} slots={booth.slots} template={booth.template} />
  if (pathname === '/success' && orderId) return <SuccessPage onStartOver={() => { sessionStorage.removeItem('selfbooth.last-order-id'); setOrderId(''); navigate('/') }} orderId={orderId} />
  return <NotFoundPage />
}
