import { useEffect, useState } from 'react'
import { usePathname } from './hooks/usePathname'
import { useSelfBooth } from './hooks/useSelfBooth'
import { ComposerPage } from './pages/ComposerPage'
import { HomePage } from './pages/HomePage'
import { NotFoundPage } from './pages/NotFoundPage'
import { OrderPreviewPage } from './pages/OrderPreviewPage'
import { SuccessPage } from './pages/SuccessPage'
import { TemplateSelectionPage } from './pages/TemplateSelectionPage'
import { RoomSelectionPage } from './pages/RoomSelectionPage'
import { RoomSummaryPage } from './pages/RoomSummaryPage'
import { isValidPhoneNumber } from './features/orders/phoneNumber'
import { EditorErrorBoundary } from './components/editor/EditorErrorBoundary'
import { downloadComposition } from './features/orders/services/downloadComposition'
import { useBranding } from './contexts/BrandingContext'
import { renderComposition } from './features/orders/services/renderComposition'

export function CustomerApp() {
  const booth = useSelfBooth()
  const branding = useBranding()
  const { pathname, navigate } = usePathname()
  const [orderId, setOrderId] = useState(() => sessionStorage.getItem('selfbooth.last-order-id') ?? '')
  const [downloading, setDownloading] = useState(false)
  const [framePreviews, setFramePreviews] = useState<Record<string, string>>({})

  const downloadCurrentFrame = async () => {
    if (downloading) return
    setDownloading(true)
    try { await downloadComposition({ branding, slots: booth.slots, template: booth.template }) }
    catch (reason) { booth.reportPhotoError(reason instanceof Error ? reason.message : 'Unable to download this frame.') }
    finally { setDownloading(false) }
  }

  const saveAndContinue = async () => {
    if (!booth.completeCurrentFrame() || downloading) return
    setDownloading(true)
    try {
      const rendered = await renderComposition(booth.template, booth.slots, { branding })
      const previewUrl = URL.createObjectURL(rendered.preview)
      setFramePreviews((current) => {
        const previous = current[booth.template.id]
        if (previous) URL.revokeObjectURL(previous)
        return { ...current, [booth.template.id]: previewUrl }
      })
      if (booth.currentFrameIndex < booth.roomTemplates.length - 1) booth.selectFrame(booth.currentFrameIndex + 1)
      else navigate('/summary')
    } catch (reason) { booth.reportPhotoError(reason instanceof Error ? reason.message : 'Unable to save this frame.') }
    finally { setDownloading(false) }
  }

  useEffect(() => {
    if (pathname === '/editor' && booth.slots.length === 0) booth.openEditor()
  }, [booth, pathname])

  if (pathname === '/') return <HomePage onContinue={(phoneNumber) => { booth.setPhoneNumber(phoneNumber); navigate('/rooms') }} phoneNumber={booth.phoneNumber} />
  if (pathname === '/rooms') return isValidPhoneNumber(booth.phoneNumber) ? <RoomSelectionPage onBack={() => navigate('/')} onSelect={(roomId) => { booth.selectRoom(roomId); navigate('/editor') }} rooms={booth.rooms} templateCount={(roomId) => booth.templates.filter((template) => template.roomId === roomId).length} /> : <HomePage onContinue={(phoneNumber) => { booth.setPhoneNumber(phoneNumber); navigate('/rooms') }} phoneNumber={booth.phoneNumber} />
  if (pathname === '/templates' && booth.room) return <TemplateSelectionPage onBack={() => navigate('/rooms')} onContinue={() => { booth.openEditor(); navigate('/editor') }} onSelect={booth.selectTemplate} roomName={booth.room.name} selectedTemplateId={booth.selectedTemplateId} templates={booth.roomTemplates} />
  if (pathname === '/editor' && booth.selectedTemplateId) return <EditorErrorBoundary onError={booth.reportPhotoError}><ComposerPage completedFrameIds={booth.completedFrameIds} currentSlot={booth.currentSlot} downloading={downloading} frameCount={booth.roomTemplates.length} frameIds={booth.roomTemplates.map((template) => template.id)} frameIndex={booth.currentFrameIndex} onAddPhotoAssets={booth.addUploadedAssets} onAddPhotos={booth.addUploadedPhotos} onBack={() => { if (booth.currentFrameIndex > 0) booth.selectFrame(booth.currentFrameIndex - 1); else navigate('/rooms') }} onClear={booth.clearAll} onClearSelectedPhotos={booth.clearSelectedPhotos} onCurrentSlotChange={booth.setCurrentSlot} onDeletePhoto={booth.deleteUploadedPhoto} onDownload={downloadCurrentFrame} onFillEmpty={booth.fillEmpty} onMovePhoto={booth.moveUploadedPhoto} onNext={saveAndContinue} onRandomFill={booth.randomFill} onRemove={booth.removeSlot} onReplace={booth.replaceSlot} onReplacePhoto={booth.replaceUploadedPhoto} onSelectFrame={booth.selectFrame} onShuffle={booth.shuffleSlots} onToggleSelectedPhoto={booth.toggleSelectedPhoto} onTransform={booth.updateTransform} onFitChange={booth.updateFit} selectedPhotoIds={booth.selectedPhotoIds} slots={booth.slots} template={booth.template} uploadedPhotos={booth.uploadedPhotos} photoError={booth.photoError} onClearPhotoError={booth.clearPhotoError} onPhotoError={booth.reportPhotoError} /></EditorErrorBoundary>
  if (pathname === '/summary' && booth.room) return <RoomSummaryPage completedFrameIds={booth.completedFrameIds} frameSlots={booth.frameSlots} onEdit={(index) => { booth.selectFrame(index); navigate('/editor') }} onSuccess={(id) => { sessionStorage.setItem('selfbooth.last-order-id', id); setOrderId(id); navigate('/success') }} phoneNumber={booth.phoneNumber} previewUrls={framePreviews} roomId={booth.room.id} roomName={booth.room.name} templates={booth.roomTemplates} />
  if (pathname === '/preview' && booth.room) return <OrderPreviewPage onBack={() => navigate('/editor')} onSuccess={(id) => { sessionStorage.setItem('selfbooth.last-order-id', id); setOrderId(id); navigate('/success') }} phoneNumber={booth.phoneNumber} roomId={booth.room.id} slots={booth.slots} template={booth.template} />
  if (pathname === '/success' && orderId) return <SuccessPage onStartOver={() => { sessionStorage.removeItem('selfbooth.last-order-id'); setOrderId(''); navigate('/') }} orderId={orderId} />
  return <NotFoundPage />
}
