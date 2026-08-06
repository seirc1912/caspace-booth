import { useEffect, useState } from 'react'
import { usePathname } from './hooks/usePathname'
import { useSelfBooth } from './hooks/useSelfBooth'
import { ComposerPage } from './pages/ComposerPage'
import { HomePage } from './pages/HomePage'
import { NotFoundPage } from './pages/NotFoundPage'
import { OrderPreviewPage } from './pages/OrderPreviewPage'
import { SuccessPage } from './pages/SuccessPage'
import { TemplateSelectionPage } from './pages/TemplateSelectionPage'

export function CustomerApp() {
  const booth = useSelfBooth()
  const { pathname, navigate } = usePathname()
  const [orderId, setOrderId] = useState(() => sessionStorage.getItem('selfbooth.last-order-id') ?? '')

  useEffect(() => {
    if (pathname === '/editor' && booth.slots.length === 0) booth.openEditor()
  }, [booth, pathname])

  if (pathname === '/') return <HomePage onStart={() => navigate('/templates')} />
  if (pathname === '/templates') return <TemplateSelectionPage onContinue={() => { booth.openEditor(); navigate('/editor') }} onSelect={booth.selectTemplate} selectedTemplateId={booth.selectedTemplateId} templates={booth.templates} />
  if (pathname === '/editor') return <ComposerPage currentSlot={booth.currentSlot} maximumPhotos={booth.maximumPhotos} onAddPhotoAssets={booth.addUploadedAssets} onAddPhotos={booth.addUploadedPhotos} onBack={() => navigate('/templates')} onClear={booth.clearAll} onClearSelectedPhotos={booth.clearSelectedPhotos} onCurrentSlotChange={booth.setCurrentSlot} onDeletePhoto={booth.deleteUploadedPhoto} onFillEmpty={booth.fillEmpty} onMovePhoto={booth.moveUploadedPhoto} onNext={() => navigate('/preview')} onRandomFill={booth.randomFill} onRemove={booth.removeSlot} onReplace={booth.replaceSlot} onReplacePhoto={booth.replaceUploadedPhoto} onShuffle={booth.shuffleSlots} onToggleSelectedPhoto={booth.toggleSelectedPhoto} onTransform={booth.updateTransform} selectedPhotoIds={booth.selectedPhotoIds} slots={booth.slots.length ? booth.slots : booth.template.slots.map(() => null)} template={booth.template} uploadedPhotos={booth.uploadedPhotos} />
  if (pathname === '/preview') return <OrderPreviewPage onBack={() => navigate('/editor')} onSuccess={(id) => { sessionStorage.setItem('selfbooth.last-order-id', id); setOrderId(id); navigate('/success') }} slots={booth.slots} template={booth.template} />
  if (pathname === '/success' && orderId) return <SuccessPage onStartOver={() => { sessionStorage.removeItem('selfbooth.last-order-id'); setOrderId(''); navigate('/') }} orderId={orderId} />
  return <NotFoundPage />
}
