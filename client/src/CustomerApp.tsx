import { useEffect, useState } from 'react'
import { EditorErrorBoundary } from './components/editor/EditorErrorBoundary'
import { useBranding } from './contexts/BrandingContext'
import type { PrintOrderDraft, PrintOrderItem } from './features/orders/repositories/PrintOrderRepository'
import { downloadComposition } from './features/orders/services/downloadComposition'
import { printOrderRepository } from './features/orders/services/orderServiceInstance'
import { renderComposition } from './features/orders/services/renderComposition'
import { isValidPhoneNumber } from './features/orders/phoneNumber'
import { usePathname } from './hooks/usePathname'
import { useSelfBooth } from './hooks/useSelfBooth'
import { startPhotoLibrarySession, useSessionPhotos } from './features/photos/useSessionPhotos'
import type { PhotoLibrarySession } from './features/photos/useSessionPhotos'
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
  const [framePreviews, setFramePreviews] = useState<Record<string, string>>({})
  const [orderDraft, setOrderDraft] = useState<PrintOrderDraft | null>(null)
  const [orderItems, setOrderItems] = useState<Record<string, PrintOrderItem>>({})
  const [customerSession, setCustomerSession] = useState<PhotoLibrarySession | null>(() => {
    try {
      return JSON.parse(sessionStorage.getItem('selfbooth.photo-library-session') ?? 'null') as PhotoLibrarySession | null
    } catch { return null }
  })

  useSessionPhotos(customerSession, booth.addUploadedAssets, booth.reportPhotoError, booth.clearPhotoError)

  const enterRoom = (boothId: string) => {
    booth.resetSessionPhotos(); booth.selectRoom(boothId)
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
    if (!booth.room || downloading) return
    const populatedFrames = booth.roomTemplates.map((template, index) => ({
      template,
      index,
      slots: template.id === booth.template.id ? booth.slots : booth.frameSlots[template.id] ?? template.slots.map(() => null),
    })).filter((frame) => frame.slots.some(Boolean))
    if (!populatedFrames.length) { booth.reportPhotoError('Please select at least one photo.'); return }
    setDownloading(true)
    try {
      const draft = orderDraft ?? await printOrderRepository.createDraft(booth.phoneNumber, booth.room.id)
      if (!orderDraft) setOrderDraft(draft)
      const populatedIds = new Set(populatedFrames.map((frame) => frame.template.id))
      for (const [templateId, item] of Object.entries(orderItems)) {
        if (!populatedIds.has(templateId)) await printOrderRepository.removeItem(draft, item)
      }
      for (const frame of populatedFrames) {
        let rendered
        try { rendered = await renderComposition(frame.template, frame.slots, { branding }) }
        catch (reason) { throw new Error(`Failed to render print image: ${reason instanceof Error ? reason.message : String(reason)}`, { cause: reason }) }
        const item = await printOrderRepository.addItem(draft, booth.phoneNumber, frame.template.id, rendered.print, frame.index)
        setOrderItems((current) => ({ ...current, [frame.template.id]: item }))
        const previewUrl = URL.createObjectURL(rendered.preview)
        setFramePreviews((current) => { const previous = current[frame.template.id]; if (previous) URL.revokeObjectURL(previous); return { ...current, [frame.template.id]: previewUrl } })
      }
      const submitted = await printOrderRepository.submit(draft)
      sessionStorage.setItem('selfbooth.last-order-id', submitted.id)
      setOrderId(submitted.id)
      navigate('/success')
    } catch (reason) { booth.reportPhotoError(reason instanceof Error ? reason.message : 'Unable to add this image to the Print Order.') }
    finally { setDownloading(false) }
  }

  const removeOrderItem = async (templateId: string) => {
    const item = orderItems[templateId]
    if (!orderDraft || !item) return
    await printOrderRepository.removeItem(orderDraft, item)
    setOrderItems((current) => { const next = { ...current }; delete next[templateId]; return next })
    setFramePreviews((current) => { const next = { ...current }; if (next[templateId]) URL.revokeObjectURL(next[templateId]); delete next[templateId]; return next })
    booth.uncompleteFrame(templateId)
  }

  const submitOrder = async () => {
    if (!orderDraft) throw new Error('Add at least one image to the Print Order.')
    return (await printOrderRepository.submit(orderDraft)).id
  }

  useEffect(() => { if (pathname === '/editor' && booth.slots.length === 0) booth.openEditor() }, [booth, pathname])

  if (pathname === '/') return <HomePage onContinue={(phoneNumber) => { booth.setPhoneNumber(phoneNumber); navigate('/rooms') }} phoneNumber={booth.phoneNumber} />
  if (pathname === '/rooms') return isValidPhoneNumber(booth.phoneNumber) ? <RoomSelectionPage onBack={() => navigate('/')} onSelect={enterRoom} rooms={booth.rooms} templateCount={(roomId) => booth.templates.filter((template) => template.roomId === roomId).length} /> : <HomePage onContinue={(phoneNumber) => { booth.setPhoneNumber(phoneNumber); navigate('/rooms') }} phoneNumber={booth.phoneNumber} />
  if (pathname === '/templates' && booth.room) return <TemplateSelectionPage onBack={() => navigate('/rooms')} onContinue={() => { booth.openEditor(); navigate('/editor') }} onSelect={booth.selectTemplate} roomName={booth.room.name} selectedTemplateId={booth.selectedTemplateId} templates={booth.roomTemplates} />
  if (pathname === '/editor' && booth.selectedTemplateId) return <EditorErrorBoundary onError={booth.reportPhotoError}><ComposerPage canOrder={Object.values(booth.frameSlots).some((slots) => slots.some(Boolean))} completedFrameIds={booth.completedFrameIds} currentSlot={booth.currentSlot} downloading={downloading} frameCount={booth.roomTemplates.length} frameIds={booth.roomTemplates.map((template) => template.id)} frameIndex={booth.currentFrameIndex} onAddPhotoAssets={booth.addUploadedAssets} onAddPhotos={booth.addUploadedPhotos} onBack={() => navigate('/rooms')} onClear={booth.clearAll} onClearSelectedPhotos={booth.clearSelectedPhotos} onCurrentSlotChange={booth.setCurrentSlot} onDeletePhoto={booth.deleteUploadedPhoto} onDownload={downloadCurrentFrame} onFillEmpty={booth.fillEmpty} onMovePhoto={booth.moveUploadedPhoto} onNext={saveAndContinue} onPrevious={() => booth.selectFrame(booth.currentFrameIndex - 1)} onRandomFill={booth.randomFill} onRemove={booth.removeSlot} onReplace={booth.replaceSlot} onReplacePhoto={booth.replaceUploadedPhoto} onSave={booth.completeCurrentFrame} onSelectFrame={booth.selectFrame} onShuffle={booth.shuffleSlots} onToggleSelectedPhoto={booth.toggleSelectedPhoto} onTransform={booth.updateTransform} onFitChange={booth.updateFit} selectedPhotoIds={booth.selectedPhotoIds} slots={booth.slots} template={booth.template} uploadedPhotos={booth.uploadedPhotos} photoError={booth.photoError} onClearPhotoError={booth.clearPhotoError} onPhotoError={booth.reportPhotoError} /></EditorErrorBoundary>
  if (pathname === '/summary' && booth.room) return <RoomSummaryPage completedFrameIds={booth.completedFrameIds} frameSlots={booth.frameSlots} onEdit={(index) => { booth.selectFrame(index); navigate('/editor') }} onRemove={removeOrderItem} onSubmit={submitOrder} onSuccess={(id) => { sessionStorage.setItem('selfbooth.last-order-id', id); setOrderId(id); navigate('/success') }} previewUrls={framePreviews} roomName={booth.room.name} templates={booth.roomTemplates} />
  if (pathname === '/preview' && booth.room) return <OrderPreviewPage onBack={() => navigate('/editor')} onSuccess={(id) => { sessionStorage.setItem('selfbooth.last-order-id', id); setOrderId(id); navigate('/success') }} phoneNumber={booth.phoneNumber} roomId={booth.room.id} slots={booth.slots} template={booth.template} />
  if (pathname === '/success' && orderId) return <SuccessPage onStartOver={() => { sessionStorage.removeItem('selfbooth.last-order-id'); setOrderId(''); navigate('/') }} orderId={orderId} />
  return <NotFoundPage />
}
