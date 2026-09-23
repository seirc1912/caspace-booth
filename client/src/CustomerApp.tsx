import { useEffect, useRef, useState } from 'react'
import { EditorErrorBoundary } from './components/editor/EditorErrorBoundary'
import { useBranding } from './contexts/BrandingContext'
import type { PrintOrderDraft, PrintOrderItem } from './features/orders/repositories/PrintOrderRepository'
import { completedFramesForOrder } from './features/orders/completedFrames'
import { saveComposition } from './features/orders/services/saveComposition'
import { printOrderRepository } from './features/orders/services/orderServiceInstance'
import { compositionAssetSources, CompositionAssetError, prefetchTemplateExportAssets, RemoteExportAssetCache, RenderAssetCache, renderComposition, type RenderTiming } from './features/orders/services/renderComposition'
import { createOrderPhotoSnapshot, runFailureSafeOrder, type OrderPhotoSnapshot } from './features/orders/services/orderPhotoSnapshot'
import { flushOrderDraftBestEffort } from './features/orders/services/orderDraftFlush'
import { isValidPhoneNumber } from './features/orders/phoneNumber'
import { usePathname } from './hooks/usePathname'
import { useSelfBooth } from './hooks/useSelfBooth'
import { startPhotoLibrarySession, useSessionPhotos } from './features/photos/useSessionPhotos'
import type { PhotoLibrarySession } from './features/photos/useSessionPhotos'
import { prefetchAdjacentTemplateDetails } from './features/templates/templateDetailLookahead'
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
  const branding = useBranding(); const { pathname, navigate } = usePathname()
  const [customerSession, setCustomerSession] = useState<PhotoLibrarySession | null>(() => {
    try {
      return JSON.parse(sessionStorage.getItem('selfbooth.photo-library-session') ?? 'null') as PhotoLibrarySession | null
    } catch { return null }
  })
  const booth = useSelfBooth(customerSession)
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
  const [remoteExportAssets] = useState(() => new RemoteExportAssetCache())
  const [editorBackground, setEditorBackground] = useState<{ canonical: string; local: string } | null>(null)
  const debugOrderTiming = import.meta.env.DEV || sessionStorage.getItem('selfbooth.debug-order-timing') === '1'
  useSessionPhotos(customerSession, booth.addUploadedAssets, booth.reportPhotoError, booth.clearPhotoError)

  const roomFrames = booth.roomTemplates.map((template, index) => ({
    template,
    index,
    slots: template.id === booth.template.id ? booth.slots : booth.frameSlots[template.id] ?? template.slots.map(() => null),
  }))
  const completedFrames = completedFramesForOrder(roomFrames)
  const readyFrameCount = completedFrames.length
  const requiredFrameCount = booth.roomTemplateSummaries.length
  const canOrder = readyFrameCount > 0
  const incompleteOrderMessage = 'Please complete at least one frame before ordering.'

  const enterRoom = async (boothId: string) => {
    remoteExportAssets.clear()
    booth.detachDraftRecovery()
    setCustomerSession(null)
    sessionStorage.removeItem('selfbooth.photo-library-session')
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

  const saveCurrentFrame = async () => {
    if (downloading) return
    setDownloading(true)
    const assetCache = new RenderAssetCache(remoteExportAssets)
    try { await saveComposition({ assetCache, branding, slots: booth.slots, template: booth.template }) }
    catch (reason) { booth.reportPhotoError(reason instanceof Error ? reason.message : 'Unable to save this photo.') }
    finally { assetCache.clear(); setDownloading(false) }
  }

  const saveAndContinue = async () => {
    if (!booth.room || processingOrder.current) return
    if (!canOrder) { booth.reportPhotoError(incompleteOrderMessage); return }
    processingOrder.current = true
    setDownloading(true)
    const orderStartedAt = performance.now()
    const orderTimings: Array<{ frame: number; render: RenderTiming; uploadMs: number; itemRpcMs: number }> = []
    const assetCache = new RenderAssetCache(remoteExportAssets)
    let orderSnapshot: OrderPhotoSnapshot | null = null
    try {
      setOrderProgress('Creating print order…')
      await flushOrderDraftBestEffort(booth.flushLocalDraft)
      orderSnapshot = await createOrderPhotoSnapshot(completedFrames, branding)
      const orderFrames = orderSnapshot.frames
      const draftStartedAt = performance.now()
      const draft = orderDraftRef.current ?? await printOrderRepository.createDraft(booth.phoneNumber, booth.room.id)
      const draftMs = performance.now() - draftStartedAt
      if (!orderDraftRef.current) { orderDraftRef.current = draft; setOrderDraft(draft) }
      const populatedIds = new Set(orderFrames.map((frame) => frame.template.id))
      for (const [templateId, item] of Object.entries(orderItemsRef.current)) {
        if (!populatedIds.has(templateId)) {
          await printOrderRepository.removeItem(draft, item)
          delete orderItemsRef.current[templateId]
          delete uploadedFrameSlotsRef.current[templateId]
        }
      }
      setOrderItems({ ...orderItemsRef.current })
      const pendingFrames = orderFrames.filter((frame) => !orderItemsRef.current[frame.template.id] || uploadedFrameSlotsRef.current[frame.template.id] !== frame.sourceSlots)
      let completed = orderFrames.length - pendingFrames.length
      const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
      const networkConcurrency = mobile ? 1 : 2
      const activeUploads = new Set<Promise<void>>()
      try {
        for (let pendingIndex = 0; pendingIndex < pendingFrames.length; pendingIndex += 1) {
          const frame = pendingFrames[pendingIndex]!
          if (activeUploads.size >= networkConcurrency) await Promise.race(activeUploads)
          setOrderProgress(`Preparing prints ${completed + 1}/${orderFrames.length}…`)
          let timing: RenderTiming | undefined
          let rendered
          try { rendered = await renderComposition(frame.template, frame.slots, { branding, createPreview: false, assetCache, onTiming: (value) => { timing = value } }) }
          catch (reason) { throw new Error(`Failed to render print image: ${reason instanceof Error ? reason.message : String(reason)}`, { cause: reason }) }
          const nextFrame = pendingFrames[pendingIndex + 1]
          assetCache.retainOnly(nextFrame ? compositionAssetSources(nextFrame.template, nextFrame.slots, branding) : [])
          setOrderProgress(`Uploading prints ${completed + 1}/${orderFrames.length}…`)
          const upload = (async () => {
            let networkTiming: { uploadMs: number; itemRpcMs: number } | undefined
            const item = await printOrderRepository.addItem(draft, booth.phoneNumber, frame.template.id, rendered.print, frame.index, (value) => { networkTiming = value })
            orderItemsRef.current = { ...orderItemsRef.current, [frame.template.id]: item }
            uploadedFrameSlotsRef.current = { ...uploadedFrameSlotsRef.current, [frame.template.id]: frame.sourceSlots }
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
      await runFailureSafeOrder(
        () => printOrderRepository.submit(draft),
        async (confirmed) => {
          printOrderRepository.releaseDraft(draft)
          sessionStorage.setItem('selfbooth.last-order-id', confirmed.id)
          setOrderId(confirmed.id)
          await booth.clearLocalDraft()
        },
      )
      const submitMs = performance.now() - submitStartedAt
      if (debugOrderTiming) console.info('[print-order timing]', { draftMs, frames: orderTimings.sort((left, right) => left.frame - right.frame), submitMs, totalMs: performance.now() - orderStartedAt, concurrency: { render: 1, network: networkConcurrency } })
      navigate('/success')
    } catch (reason) {
      const assetError = reason instanceof CompositionAssetError ? reason : reason instanceof Error && reason.cause instanceof CompositionAssetError ? reason.cause : null
      if (assetError) console.error('[print-order asset failure]', { assetType: assetError.assetType, scheme: assetError.scheme, stage: assetError.stage, status: assetError.status, abort: assetError.cause instanceof DOMException && assetError.cause.name === 'AbortError' })
      else console.error('[print-order failure]', { name: reason instanceof Error ? reason.name : 'UnknownError', message: reason instanceof Error ? reason.message : String(reason) })
      booth.reportPhotoError('Order chưa hoàn tất. Ảnh của bạn vẫn được giữ lại. Vui lòng thử lại.')
    }
    finally { assetCache.clear(); orderSnapshot?.release(); processingOrder.current = false; setDownloading(false); setOrderProgress(null) }
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
    const submitted = await printOrderRepository.submit(orderDraft)
    await booth.clearLocalDraft()
    return submitted.id
  }

  const finishSuccessfulOrder = (id: string) => {
    sessionStorage.setItem('selfbooth.last-order-id', id)
    setOrderId(id)
    void booth.clearLocalDraft().finally(() => navigate('/success'))
  }

  const continueFromPhone = (phoneNumber: string) => {
    if (customerSession?.phoneNumber !== phoneNumber) {
      setCustomerSession(null)
      sessionStorage.removeItem('selfbooth.photo-library-session')
    }
    const recoveringDraft = booth.setPhoneNumber(phoneNumber)
    navigate(recoveringDraft ? '/editor' : '/rooms')
  }

  useEffect(() => { if (pathname === '/editor' && booth.templateReady && booth.slots.length === 0) booth.openEditor() }, [booth, pathname])
  useEffect(() => {
    if (pathname !== '/editor' || !booth.templateReady) return
    let active = true
    let localBackground: string | null = null
    const canonicalBackground = booth.template.backgroundUrl
    const timer = window.setTimeout(() => {
      const background = canonicalBackground && /^https?:/i.test(canonicalBackground)
        ? remoteExportAssets.load(canonicalBackground, 'template-background').then((blob) => {
          if (!active) return
          localBackground = URL.createObjectURL(blob)
          setEditorBackground({ canonical: canonicalBackground, local: localBackground })
        })
        : Promise.resolve()
      void Promise.all([background, prefetchTemplateExportAssets(booth.template, branding, remoteExportAssets)]).catch((reason) => {
        if (debugOrderTiming) console.warn('[template export prefetch]', { templateId: booth.template.id, name: booth.template.name, message: reason instanceof Error ? reason.message : String(reason) })
      })
    }, 0)
    return () => {
      active = false
      window.clearTimeout(timer)
      if (localBackground) URL.revokeObjectURL(localBackground)
    }
  }, [booth.template, booth.templateReady, branding, debugOrderTiming, pathname, remoteExportAssets])
  useEffect(() => {
    if (pathname !== '/editor' || !booth.templateReady) return
    let active = true
    const timer = window.setTimeout(() => {
      void prefetchAdjacentTemplateDetails(
        booth.roomTemplateSummaries,
        booth.template.id,
        booth.ensureTemplateDetail,
        async (nextTemplate) => {
          if (!active) return
          await prefetchTemplateExportAssets(nextTemplate, branding, remoteExportAssets)
        },
      ).catch((reason) => {
        if (debugOrderTiming) console.warn('[frame lookahead prefetch]', { templateId: booth.template.id, message: reason instanceof Error ? reason.message : String(reason) })
      })
    }, 0)
    return () => { active = false; window.clearTimeout(timer) }
  }, [booth.ensureTemplateDetail, booth.roomTemplateSummaries, booth.template.id, booth.templateReady, branding, debugOrderTiming, pathname, remoteExportAssets])
  useEffect(() => () => remoteExportAssets.clear(), [remoteExportAssets])

  if (pathname === '/') return <HomePage onContinue={continueFromPhone} phoneNumber={booth.phoneNumber} />
  if (pathname === '/rooms') return isValidPhoneNumber(booth.phoneNumber) ? <RoomSelectionPage error={booth.roomsError} loading={booth.roomsLoading} onBack={() => navigate('/')} onSelect={enterRoom} rooms={booth.rooms} templateCount={(roomId) => booth.templates.filter((template) => template.roomId === roomId).length} /> : <HomePage onContinue={continueFromPhone} phoneNumber={booth.phoneNumber} />
  if (pathname === '/templates' && booth.room) return <TemplateSelectionPage onBack={() => navigate('/rooms')} onContinue={() => { booth.openEditor(); navigate('/editor') }} onSelect={booth.selectTemplate} roomName={booth.room.name} selectedTemplateId={booth.selectedTemplateId} templates={booth.roomTemplates} />
  if (pathname === '/editor' && !booth.draftReady) return null
  if (pathname === '/editor' && !isValidPhoneNumber(booth.phoneNumber)) return <HomePage onContinue={continueFromPhone} phoneNumber={booth.phoneNumber} />
  if (pathname === '/editor' && !booth.selectedTemplateId) return <RoomSelectionPage error={booth.roomsError} loading={booth.roomsLoading} onBack={() => navigate('/')} onSelect={enterRoom} rooms={booth.rooms} templateCount={(roomId) => booth.templates.filter((template) => template.roomId === roomId).length} />
  if (pathname === '/editor' && booth.selectedTemplateId && booth.templateReady) return <EditorErrorBoundary onError={booth.reportPhotoError}><ComposerPage allBwEnabled={booth.allBwEnabled} backgroundUrl={editorBackground?.canonical === booth.template.backgroundUrl ? editorBackground.local : booth.template.backgroundUrl && !/^https?:/i.test(booth.template.backgroundUrl) ? booth.template.backgroundUrl : null} canOrder={canOrder} completedFrameIds={booth.completedFrameIds} currentSlot={booth.currentSlot} downloading={downloading} frameCount={requiredFrameCount} frameIds={booth.roomTemplateSummaries.map((template) => template.id)} frameIndex={booth.currentFrameIndex} onBack={() => navigate('/rooms')} onCurrentSlotChange={booth.setCurrentSlot} onDownload={saveCurrentFrame} onFilterChange={booth.updateFilter} onNext={saveAndContinue} onPickFramePhotos={booth.addPhotosToFrame} onPickPhoto={booth.addPhotoToTarget} onPrevious={() => booth.selectFrame(booth.currentFrameIndex - 1)} onRemove={booth.removeSlot} onSave={booth.completeCurrentFrame} onSelectFrame={booth.selectFrame} onToggleAllBw={booth.toggleAllBw} onTransform={booth.updateTransform} onFitChange={booth.updateFit} orderProgress={orderProgress} slots={booth.slots} template={booth.template} photoError={booth.photoError} onClearPhotoError={booth.clearPhotoError} onPhotoError={booth.reportPhotoError} /></EditorErrorBoundary>
  if (pathname === '/summary' && booth.room) return <RoomSummaryPage completedFrameIds={booth.completedFrameIds} frameSlots={booth.frameSlots} onEdit={(index) => { booth.selectFrame(index); navigate('/editor') }} onRemove={removeOrderItem} onSubmit={submitOrder} onSuccess={finishSuccessfulOrder} previewUrls={framePreviews} roomName={booth.room.name} templates={booth.roomTemplates} />
  if (pathname === '/preview' && booth.room) return <OrderPreviewPage onBack={() => navigate('/editor')} onSuccess={finishSuccessfulOrder} phoneNumber={booth.phoneNumber} roomId={booth.room.id} slots={booth.slots} template={booth.template} />
  if (pathname === '/success' && orderId) return <SuccessPage onStartOver={() => { sessionStorage.removeItem('selfbooth.last-order-id'); setOrderId(''); navigate('/') }} orderId={orderId} />
  return <NotFoundPage />
}
