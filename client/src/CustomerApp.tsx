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
import { isValidPhoneNumber } from './features/orders/phoneNumber'
import { EditorErrorBoundary } from './components/editor/EditorErrorBoundary'

export function CustomerApp() {
  const booth = useSelfBooth()
  const { pathname, navigate } = usePathname()
  const [orderId, setOrderId] = useState(() => sessionStorage.getItem('selfbooth.last-order-id') ?? '')

  useEffect(() => {
    if (pathname === '/editor' && booth.slots.length === 0) booth.openEditor()
  }, [booth, pathname])

  if (pathname === '/') return <HomePage onContinue={(phoneNumber) => { booth.setPhoneNumber(phoneNumber); navigate('/rooms') }} phoneNumber={booth.phoneNumber} />
  if (pathname === '/rooms') return isValidPhoneNumber(booth.phoneNumber) ? <RoomSelectionPage onBack={() => navigate('/')} onSelect={(roomId) => { booth.selectRoom(roomId); navigate('/templates') }} rooms={booth.rooms} templateCount={(roomId) => booth.templates.filter((template) => template.roomId === roomId).length} /> : <HomePage onContinue={(phoneNumber) => { booth.setPhoneNumber(phoneNumber); navigate('/rooms') }} phoneNumber={booth.phoneNumber} />
  if (pathname === '/templates' && booth.room) return <TemplateSelectionPage onBack={() => navigate('/rooms')} onContinue={() => { booth.openEditor(); navigate('/editor') }} onSelect={booth.selectTemplate} roomName={booth.room.name} selectedTemplateId={booth.selectedTemplateId} templates={booth.roomTemplates} />
  if (pathname === '/editor' && booth.selectedTemplateId) return <EditorErrorBoundary onError={booth.reportPhotoError}><ComposerPage currentSlot={booth.currentSlot} onAddPhotoAssets={booth.addUploadedAssets} onAddPhotos={booth.addUploadedPhotos} onBack={() => navigate('/templates')} onClear={booth.clearAll} onClearSelectedPhotos={booth.clearSelectedPhotos} onCurrentSlotChange={booth.setCurrentSlot} onDeletePhoto={booth.deleteUploadedPhoto} onFillEmpty={booth.fillEmpty} onMovePhoto={booth.moveUploadedPhoto} onNext={() => navigate('/preview')} onRandomFill={booth.randomFill} onRemove={booth.removeSlot} onReplace={booth.replaceSlot} onReplacePhoto={booth.replaceUploadedPhoto} onShuffle={booth.shuffleSlots} onToggleSelectedPhoto={booth.toggleSelectedPhoto} onTransform={booth.updateTransform} onFitChange={booth.updateFit} selectedPhotoIds={booth.selectedPhotoIds} slots={booth.slots.length ? booth.slots : booth.template.slots.map(() => null)} template={booth.template} uploadedPhotos={booth.uploadedPhotos} photoError={booth.photoError} onClearPhotoError={booth.clearPhotoError} onPhotoError={booth.reportPhotoError} /></EditorErrorBoundary>
  if (pathname === '/preview' && booth.room) return <OrderPreviewPage onBack={() => navigate('/editor')} onSuccess={(id) => { sessionStorage.setItem('selfbooth.last-order-id', id); setOrderId(id); navigate('/success') }} phoneNumber={booth.phoneNumber} roomId={booth.room.id} slots={booth.slots} template={booth.template} />
  if (pathname === '/success' && orderId) return <SuccessPage onStartOver={() => { sessionStorage.removeItem('selfbooth.last-order-id'); setOrderId(''); navigate('/') }} orderId={orderId} />
  return <NotFoundPage />
}
