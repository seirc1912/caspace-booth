import { useEffect, useRef, useState } from 'react'
import { EditorErrorBoundary } from './components/editor/EditorErrorBoundary'
import { useBranding } from './contexts/BrandingContext'
import { runPerFrameSave, saveComposition } from './features/orders/services/saveComposition'
import { prefetchTemplateExportAssets, RemoteExportAssetCache, RenderAssetCache } from './features/orders/services/renderComposition'
import { isValidPhoneNumber } from './features/orders/phoneNumber'
import { usePathname } from './hooks/usePathname'
import { useSelfBooth } from './hooks/useSelfBooth'
import { startPhotoLibrarySession, useSessionPhotos } from './features/photos/useSessionPhotos'
import type { PhotoLibrarySession } from './features/photos/useSessionPhotos'
import { prefetchAdjacentTemplateDetails } from './features/templates/templateDetailLookahead'
import { commitTransitionAfterLoad } from './features/templates/frameSelection'
import { ComposerPage } from './pages/ComposerPage'
import { HomePage } from './pages/HomePage'
import { NotFoundPage } from './pages/NotFoundPage'
import { RoomSelectionPage } from './pages/RoomSelectionPage'
import { TemplateSelectionPage } from './pages/TemplateSelectionPage'

export function CustomerApp() {
  const branding = useBranding(); const { pathname, navigate } = usePathname()
  const [customerSession, setCustomerSession] = useState<PhotoLibrarySession | null>(() => {
    try {
      return JSON.parse(sessionStorage.getItem('selfbooth.photo-library-session') ?? 'null') as PhotoLibrarySession | null
    } catch { return null }
  })
  const booth = useSelfBooth(customerSession)
  const [downloading, setDownloading] = useState(false)
  const [saveConfirmation, setSaveConfirmation] = useState<string | null>(null)
  const saveConfirmationTimer = useRef<number | null>(null)
  const [remoteExportAssets] = useState(() => new RemoteExportAssetCache())
  const [editorBackground, setEditorBackground] = useState<{ canonical: string; local: string } | null>(null)
  const debugAssetPrefetch = import.meta.env.DEV || sessionStorage.getItem('selfbooth.debug-order-timing') === '1'
  useSessionPhotos(customerSession, booth.addUploadedAssets, booth.reportPhotoError, booth.clearPhotoError)

  const requiredFrameCount = booth.roomTemplateSummaries.length

  const enterRoom = async (boothId: string) => {
    try {
      await commitTransitionAfterLoad(
        () => booth.selectRoom(boothId),
        () => {
          remoteExportAssets.clear()
          booth.detachDraftRecovery()
          setCustomerSession(null)
          sessionStorage.removeItem('selfbooth.photo-library-session')
          booth.resetSessionPhotos()
          navigate('/editor')
        },
      )
    }
    catch (reason) { booth.reportPhotoError(reason instanceof Error ? reason.message : 'Unable to load this Room’s first frame.'); return }
    void startPhotoLibrarySession(boothId, booth.phoneNumber).then((session) => {
      sessionStorage.setItem('selfbooth.photo-library-session', JSON.stringify(session))
      setCustomerSession(session)
    }).catch((error) => booth.reportPhotoError(error instanceof Error ? error.message : 'Unable to start customer session'))
  }

  const saveCurrentFrame = async () => {
    if (downloading) return
    setDownloading(true)
    const assetCache = new RenderAssetCache(remoteExportAssets)
    const frameNumber = booth.currentFrameIndex + 1
    try {
      await runPerFrameSave(
        () => saveComposition({ assetCache, branding, slots: booth.slots, template: booth.template }),
        () => {
          booth.completeCurrentFrame()
          setSaveConfirmation(`Frame ${frameNumber} photo saved.`)
          if (saveConfirmationTimer.current !== null) window.clearTimeout(saveConfirmationTimer.current)
          saveConfirmationTimer.current = window.setTimeout(() => { saveConfirmationTimer.current = null; setSaveConfirmation(null) }, 2200)
        },
      )
    }
    catch (reason) { booth.reportPhotoError(reason instanceof Error ? reason.message : 'Unable to save this photo.') }
    finally { assetCache.clear(); setDownloading(false) }
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
        if (debugAssetPrefetch) console.warn('[template export prefetch]', { templateId: booth.template.id, name: booth.template.name, message: reason instanceof Error ? reason.message : String(reason) })
      })
    }, 0)
    return () => {
      active = false
      window.clearTimeout(timer)
      if (localBackground) URL.revokeObjectURL(localBackground)
    }
  }, [booth.template, booth.templateReady, branding, debugAssetPrefetch, pathname, remoteExportAssets])
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
        if (debugAssetPrefetch) console.warn('[frame lookahead prefetch]', { templateId: booth.template.id, message: reason instanceof Error ? reason.message : String(reason) })
      })
    }, 0)
    return () => { active = false; window.clearTimeout(timer) }
  }, [booth.ensureTemplateDetail, booth.roomTemplateSummaries, booth.template.id, booth.templateReady, branding, debugAssetPrefetch, pathname, remoteExportAssets])
  useEffect(() => () => remoteExportAssets.clear(), [remoteExportAssets])
  useEffect(() => () => { if (saveConfirmationTimer.current !== null) window.clearTimeout(saveConfirmationTimer.current) }, [])

  if (pathname === '/') return <HomePage onContinue={continueFromPhone} phoneNumber={booth.phoneNumber} />
  if (pathname === '/rooms') return isValidPhoneNumber(booth.phoneNumber) ? <RoomSelectionPage error={booth.roomsError} loading={booth.roomsLoading} onBack={() => navigate('/')} onSelect={enterRoom} rooms={booth.rooms} templateCount={(roomId) => booth.templates.filter((template) => template.roomId === roomId).length} /> : <HomePage onContinue={continueFromPhone} phoneNumber={booth.phoneNumber} />
  if (pathname === '/templates' && booth.room) return <TemplateSelectionPage onBack={() => navigate('/rooms')} onContinue={() => { booth.openEditor(); navigate('/editor') }} onSelect={booth.selectTemplate} roomName={booth.room.name} selectedTemplateId={booth.selectedTemplateId} templates={booth.roomTemplates} />
  if (pathname === '/editor' && !booth.draftReady) return null
  if (pathname === '/editor' && !isValidPhoneNumber(booth.phoneNumber)) return <HomePage onContinue={continueFromPhone} phoneNumber={booth.phoneNumber} />
  if (pathname === '/editor' && !booth.selectedTemplateId) return <RoomSelectionPage error={booth.roomsError} loading={booth.roomsLoading} onBack={() => navigate('/')} onSelect={enterRoom} rooms={booth.rooms} templateCount={(roomId) => booth.templates.filter((template) => template.roomId === roomId).length} />
  if (pathname === '/editor' && booth.selectedTemplateId && booth.templateReady) return <EditorErrorBoundary onError={booth.reportPhotoError}><ComposerPage allBwEnabled={booth.allBwEnabled} backgroundUrl={editorBackground?.canonical === booth.template.backgroundUrl ? editorBackground.local : booth.template.backgroundUrl && !/^https?:/i.test(booth.template.backgroundUrl) ? booth.template.backgroundUrl : null} completedFrameIds={booth.completedFrameIds} currentSlot={booth.currentSlot} downloading={downloading} frameCount={requiredFrameCount} frameIds={booth.roomTemplateSummaries.map((template) => template.id)} frameIndex={booth.currentFrameIndex} onBack={() => navigate('/rooms')} onCurrentSlotChange={booth.setCurrentSlot} onDownload={saveCurrentFrame} onFilterChange={booth.updateFilter} onPickFramePhotos={booth.addPhotosToFrame} onPickPhoto={booth.addPhotoToTarget} onPrevious={() => booth.selectFrame(booth.currentFrameIndex - 1)} onRemove={booth.removeSlot} onSelectFrame={booth.selectFrame} onToggleAllBw={booth.toggleAllBw} onTransform={booth.updateTransform} onFitChange={booth.updateFit} saveConfirmation={saveConfirmation} slots={booth.slots} template={booth.template} photoError={booth.photoError} onClearPhotoError={booth.clearPhotoError} onPhotoError={booth.reportPhotoError} /></EditorErrorBoundary>
  return <NotFoundPage />
}
