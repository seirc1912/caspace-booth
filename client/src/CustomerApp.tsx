import { useSelfBooth } from './hooks/useSelfBooth'
import { ComposerPage } from './pages/ComposerPage'
import { ExportPreviewPage } from './pages/ExportPreviewPage'
import { TemplateSelectionPage } from './pages/TemplateSelectionPage'
import { SessionProvider } from './providers/SessionProvider'

function CustomerFlow() {
  const booth = useSelfBooth()
  if (booth.view === 'editor') return <ComposerPage onBack={() => booth.setView('templates')} onClear={booth.clearAll} onFillEmpty={booth.fillEmpty} onNext={() => booth.setView('preview')} onRandomFill={booth.randomFill} onShuffle={booth.shuffleSlots} onCurrentSlotChange={booth.setCurrentSlot} onClearSelectedPhotos={booth.clearSelectedPhotos} onRemove={booth.removeSlot} onReplace={booth.replaceSlot} onTransform={booth.updateTransform} onToggleSelectedPhoto={booth.toggleSelectedPhoto} currentSlot={booth.currentSlot} selectedPhotoIds={booth.selectedPhotoIds} slots={booth.slots} template={booth.template} />
  if (booth.view === 'preview') return <ExportPreviewPage onBack={() => booth.setView('editor')} slots={booth.slots} template={booth.template} />
  return <TemplateSelectionPage onContinue={booth.openEditor} onSelect={booth.selectTemplate} selectedTemplateId={booth.selectedTemplateId} templates={booth.templates} />
}

export function CustomerApp() {
  return <SessionProvider><CustomerFlow /></SessionProvider>
}
