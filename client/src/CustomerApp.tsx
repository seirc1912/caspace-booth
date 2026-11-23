import { useEffect, useRef, useState } from 'react'
import { EditorErrorBoundary } from './components/editor/EditorErrorBoundary'
import { useBranding } from './contexts/BrandingContext'
import { runPerFrameSave, saveComposition } from './features/orders/services/saveComposition'
import { frameSaveEvent, newRunId, reportClientTiming } from './features/metrics/clientTiming'
import { prefetchTemplateExportAssets, RemoteExportAssetCache, RenderAssetCache } from './features/orders/services/renderComposition'
import { isValidPhoneNumber } from './features/orders/phoneNumber'
import { usePathname } from './hooks/usePathname'
import { useSelfBooth } from './hooks/useSelfBooth'
import { createCustomerSession, type CustomerSession } from './features/photos/customerSession'
import { loadBoothPhotoFiles, loadBoothSelection, saveBoothSelection, type BoothPhoto, type BoothPoolPhoto } from './features/boothPhotos/boothPhotosClient'
import { useBoothPhotos } from './features/boothPhotos/useBoothPhotos'
import { BoothPhotoPickerPage } from './pages/BoothPhotoPickerPage'
import { SendFramesSheet, type SendFrameRow } from './components/editor/SendFramesSheet'
import { frameSignature, isFrameFilled, renderFrameFile, sendFrames, type FrameSendState, type SendableFrame } from './features/orders/services/sendFrames'
import { prefetchAdjacentTemplateDetails } from './features/templates/templateDetailLookahead'
import { commitTransitionAfterLoad } from './features/templates/frameSelection'
import { ComposerPage } from './pages/ComposerPage'
import { HomePage } from './pages/HomePage'
import { NotFoundPage } from './pages/NotFoundPage'
import { RoomSelectionPage } from './pages/RoomSelectionPage'
import { TemplateSelectionPage } from './pages/TemplateSelectionPage'

export function CustomerApp() {
  const branding = useBranding(); const { pathname, navigate } = usePathname()
  const [customerSession, setCustomerSession] = useState<CustomerSession | null>(() => {
    try {
      return JSON.parse(sessionStorage.getItem('selfbooth.photo-library-session') ?? 'null') as CustomerSession | null
    } catch { return null }
  })
  const booth = useSelfBooth(customerSession)
  const [downloading, setDownloading] = useState(false)
  const [saveConfirmation, setSaveConfirmation] = useState<string | null>(null)
  const saveConfirmationTimer = useRef<number | null>(null)
  const [remoteExportAssets] = useState(() => new RemoteExportAssetCache())
  const [editorBackground, setEditorBackground] = useState<{ canonical: string; local: string } | null>(null)
  const debugAssetPrefetch = import.meta.env.DEV || sessionStorage.getItem('selfbooth.debug-order-timing') === '1'
  const validPhone = isValidPhoneNumber(booth.phoneNumber) ? booth.phoneNumber : null
  const boothPhotos = useBoothPhotos(validPhone, pathname === '/booth-photos')
  const hasBoothPhotos = boothPhotos.list?.status === 'ok' && boothPhotos.list.photos.length > 0
  // Ticks and downloaded originals belong to one phone; a new number starts empty.
  const [boothState, setBoothState] = useState<{ phone: string | null; pool: BoothPoolPhoto[]; selection: string[] }>(() => ({ phone: validPhone, pool: [], selection: validPhone ? loadBoothSelection(validPhone) : [] }))
  const boothForPhone = boothState.phone === validPhone ? boothState : { phone: validPhone, pool: [], selection: validPhone ? loadBoothSelection(validPhone) : [] }
  const boothPool = boothForPhone.pool
  const boothSelection = boothForPhone.selection
  const setBoothSelection = (ids: string[]) => { setBoothState({ ...boothForPhone, selection: ids }); if (validPhone) saveBoothSelection(validPhone, ids) }
  const setBoothPool = (pool: BoothPoolPhoto[]) => setBoothState({ ...boothForPhone, pool })
  const applyBoothPhotoSelection = async (photos: BoothPhoto[]) => {
    const known = new Map(boothPool.map((photo) => [photo.id, photo]))
    const missing = photos.filter((photo) => !known.has(photo.id))
    const files = await loadBoothPhotoFiles(missing)
    missing.forEach((photo, index) => known.set(photo.id, { id: photo.id, thumbUrl: photo.thumbUrl, file: files[index]! }))
    setBoothPool(photos.map((photo) => known.get(photo.id)!))
    navigate('/editor')
  }

  const requiredFrameCount = booth.roomTemplateSummaries.length

  // "Gửi khung cho quán": several finished frames in one tap (signatures stop re-sending unchanged frames).
  const [sendOpen, setSendOpen] = useState(false)
  const [sending, setSending] = useState(false)
  const [sendMessage, setSendMessage] = useState<string | null>(null)
  const [sendStates, setSendStates] = useState<Record<string, { state: FrameSendState; progress?: number }>>({})
  const sentKey = customerSession ? `caspace.sent-frames.${customerSession.sessionId}` : null
  const [sentSignatures, setSentSignatures] = useState<{ key: string | null; value: Record<string, string> }>({ key: null, value: {} })
  const sentForSession = sentSignatures.key === sentKey ? sentSignatures.value : (() => { try { return sentKey ? JSON.parse(sessionStorage.getItem(sentKey) ?? '{}') as Record<string, string> : {} } catch { return {} } })()
  const sendRows: SendFrameRow[] = booth.roomTemplateSummaries.map((summary, index) => {
    const slots = booth.frameSlots[summary.id]
    const filled = isFrameFilled(slots)
    return { templateId: summary.id, frameNumber: index + 1, name: summary.name, filled, sent: filled && sentForSession[summary.id] === frameSignature(slots!), ...sendStates[summary.id] }
  })
  const sendSelectedFrames = async (templateIds: string[]) => {
    if (sending || !validPhone) return
    setSending(true)
    setSendMessage(null)
    const assetCache = new RenderAssetCache(remoteExportAssets)
    try {
      const frames: SendableFrame[] = []
      for (const id of templateIds) {
        const slots = booth.frameSlots[id]
        if (!isFrameFilled(slots)) continue
        frames.push({ templateId: id, frameNumber: booth.roomTemplateSummaries.findIndex((item) => item.id === id) + 1, template: await booth.ensureTemplateDetail(id), slots: slots! })
      }
      const submissionId = createCustomerSession('send', validPhone).sessionId
      const results = await sendFrames({ frames, phone: validPhone, submissionId, render: renderFrameFile({ branding, assetCache }), onState: (id, state, progress) => setSendStates((current) => ({ ...current, [id]: { state, progress } })) })
      const next = { ...sentForSession }
      results.forEach((result) => { if (result.ok) next[result.templateId] = frameSignature(frames.find((frame) => frame.templateId === result.templateId)!.slots) })
      setSentSignatures({ key: sentKey, value: next })
      try { if (sentKey) sessionStorage.setItem(sentKey, JSON.stringify(next)) } catch { /* in-memory only */ }
      const failed = results.filter((result) => !result.ok).length
      const firstError = results.find((result) => result.error)?.error
      setSendMessage(failed ? `Đã gửi ${results.length - failed} khung. ${failed} khung chưa gửi được${firstError ? ` (${firstError})` : ''} — bấm gửi lại.` : `Đã gửi ${results.length} khung cho quán. Cảm ơn bạn!`)
    } catch (reason) { setSendMessage(reason instanceof Error ? reason.message : 'Không gửi được khung. Vui lòng thử lại.') }
    finally { assetCache.clear(); setSending(false) }
  }

  const enterRoom = async (boothId: string) => {
    try {
      await commitTransitionAfterLoad(
        () => booth.selectRoom(boothId),
        () => {
          remoteExportAssets.clear()
          booth.detachDraftRecovery()
          booth.resetSessionPhotos()
          // Draft scope for this visit (was a Supabase RPC; now created on the device).
          const session = createCustomerSession(boothId, booth.phoneNumber)
          try { sessionStorage.setItem('selfbooth.photo-library-session', JSON.stringify(session)) } catch { /* in-memory only */ }
          setCustomerSession(session)
          navigate(hasBoothPhotos ? '/booth-photos' : '/editor')
        },
      )
    }
    catch (reason) { booth.reportPhotoError(reason instanceof Error ? reason.message : 'Unable to load this Room’s first frame.') }
  }

  const saveCurrentFrame = async () => {
    if (downloading) return
    setDownloading(true)
    const assetCache = new RenderAssetCache(remoteExportAssets)
    const frameNumber = booth.currentFrameIndex + 1
    try {
      await runPerFrameSave(
        async () => {
          const saved = await saveComposition({ assetCache, branding, slots: booth.slots, template: booth.template })
          reportClientTiming(frameSaveEvent(newRunId(), saved))
          return saved
        },
        () => {
          booth.completeCurrentFrame()
          // Timings are only logged (frame-save); nothing is shown to customers.
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
  if (pathname === '/booth-photos') return validPhone ? <BoothPhotoPickerPage error={boothPhotos.error} list={boothPhotos.list} onBack={() => navigate('/rooms')} onContinue={applyBoothPhotoSelection} onSelectedIdsChange={setBoothSelection} onSkip={() => navigate('/editor')} phone={validPhone} selectedIds={boothSelection} /> : <HomePage onContinue={continueFromPhone} phoneNumber={booth.phoneNumber} />
  if (pathname === '/templates' && booth.room) return <TemplateSelectionPage onBack={() => navigate('/rooms')} onContinue={() => { booth.openEditor(); navigate('/editor') }} onSelect={booth.selectTemplate} roomName={booth.room.name} selectedTemplateId={booth.selectedTemplateId} templates={booth.roomTemplates} />
  if (pathname === '/editor' && !booth.draftReady) return null
  if (pathname === '/editor' && !isValidPhoneNumber(booth.phoneNumber)) return <HomePage onContinue={continueFromPhone} phoneNumber={booth.phoneNumber} />
  if (pathname === '/editor' && !booth.selectedTemplateId) return <RoomSelectionPage error={booth.roomsError} loading={booth.roomsLoading} onBack={() => navigate('/')} onSelect={enterRoom} rooms={booth.rooms} templateCount={(roomId) => booth.templates.filter((template) => template.roomId === roomId).length} />
  if (pathname === '/editor' && booth.selectedTemplateId && booth.templateReady) return <EditorErrorBoundary onError={booth.reportPhotoError}><ComposerPage allBwEnabled={booth.allBwEnabled} autoFillHasExistingPhotos={booth.autoFillHasExistingPhotos} autoFillPhotoCount={booth.autoFillPhotoCount} autoFillPreparing={booth.autoFillPreparing} backgroundUrl={editorBackground?.canonical === booth.template.backgroundUrl ? editorBackground.local : booth.template.backgroundUrl && !/^https?:/i.test(booth.template.backgroundUrl) ? booth.template.backgroundUrl : null} completedFrameIds={booth.completedFrameIds} currentSlot={booth.currentSlot} downloading={downloading} frameCount={requiredFrameCount} frameIds={booth.roomTemplateSummaries.map((template) => template.id)} frameIndex={booth.currentFrameIndex} onAutoFillPhotos={booth.autoFillAllFrames} boothPool={boothPool} onOpenBoothPhotos={hasBoothPhotos ? () => navigate('/booth-photos') : undefined} sendableFrameCount={sendRows.filter((row) => row.filled).length} onOpenSendFrames={() => { setSendStates({}); setSendMessage(null); setSendOpen(true) }} onBack={() => navigate('/rooms')} onCurrentSlotChange={booth.setCurrentSlot} onDownload={saveCurrentFrame} onFilterChange={booth.updateFilter} onPickFramePhotos={booth.addPhotosToFrame} onPickPhoto={booth.addPhotoToTarget} onPrevious={() => booth.selectFrame(booth.currentFrameIndex - 1)} onRemove={booth.removeSlot} onSelectFrame={booth.selectFrame} onToggleAllBw={booth.toggleAllBw} onTransform={booth.updateTransform} onFitChange={booth.updateFit} saveConfirmation={saveConfirmation} slots={booth.slots} template={booth.template} photoError={booth.photoError} onClearPhotoError={booth.clearPhotoError} onPhotoError={booth.reportPhotoError} />{sendOpen ? <SendFramesSheet message={sendMessage} onClose={() => setSendOpen(false)} onSend={(ids) => void sendSelectedFrames(ids)} rows={sendRows} sending={sending} /> : null}</EditorErrorBoundary>
  return <NotFoundPage />
}
