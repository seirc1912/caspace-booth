import { useEffect, useMemo, useRef, useState } from 'react'
import { EditorErrorBoundary } from './components/editor/EditorErrorBoundary'
import { useBranding } from './contexts/BrandingContext'
import { runPerFrameSave, saveComposition } from './features/orders/services/saveComposition'
import { frameSaveEvent, newRunId, reportClientTiming } from './features/metrics/clientTiming'
import { prefetchTemplateExportAssets, RemoteExportAssetCache, RenderAssetCache } from './features/orders/services/renderComposition'
import { isValidPhoneNumber } from './features/orders/phoneNumber'
import { usePathname } from './hooks/usePathname'
import { useSelfBooth } from './hooks/useSelfBooth'
import { createCustomerSession, type CustomerSession } from './features/photos/customerSession'
import { createBoothPhotoLoader, loadBoothPhotoFiles, type BoothPhoto } from './features/boothPhotos/boothPhotosClient'
import { useBoothPhotos } from './features/boothPhotos/useBoothPhotos'
import { frameSignature, isFrameFilled, renderFrameFile, sendFrames, type FrameSendState, type SendableFrame } from './features/orders/services/sendFrames'
import { prefetchAdjacentTemplateDetails } from './features/templates/templateDetailLookahead'
import { commitTransitionAfterLoad } from './features/templates/frameSelection'
import { ComposerPage } from './pages/ComposerPage'
import { HomePage } from './pages/HomePage'
import { usableImageUrl } from './services/catalog/SupabaseCatalogService'
import { NotFoundPage } from './pages/NotFoundPage'
import { RoomSelectionPage } from './pages/RoomSelectionPage'
import { SendFramesPage, type SendFrameRow } from './pages/SendFramesPage'
import { displayRoomName } from './features/rooms/displayRoomName'
import type { EditorFrame } from './components/editor/FrameSwitcherSheet'

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
  // Booth photos + the customer's own uploads go straight into the editor's
  // "Ảnh phòng chụp" sheet (no separate picker step); refreshed every 10 s there.
  const boothPhotos = useBoothPhotos(validPhone, pathname === '/editor')
  const boothPhotoList = boothPhotos.list?.status === 'ok' ? boothPhotos.list.photos : []
  // One loader per phone: each original is downloaded once, only when it is used.
  const boothLoader = useMemo(() => (validPhone ? createBoothPhotoLoader() : null), [validPhone])
  const loadBoothOriginal = (photo: BoothPhoto) => (boothLoader ? boothLoader.load(photo) : loadBoothPhotoFiles([photo]).then((files) => files[0]!))

  // Frame previews show the frame artwork itself (no sample photos); details are small JSON, images load lazily.
  const roomFrameIds = booth.roomTemplateSummaries.map((summary) => summary.id).join(',')
  const { ensureTemplateDetail } = booth
  useEffect(() => { if (roomFrameIds) for (const id of roomFrameIds.split(',')) void ensureTemplateDetail(id).catch(() => undefined) }, [roomFrameIds, ensureTemplateDetail])
  const frameThumb = (summary: { id: string; thumbnailUrl: string | null }) => {
    const detail = booth.roomTemplates.find((item) => item.id === summary.id)
    return detail ? usableImageUrl(detail.backgroundUrl) ?? summary.thumbnailUrl : null
  }
  const editorFrames: EditorFrame[] = booth.roomTemplateSummaries.map((summary) => {
    const slots = booth.frameSlots[summary.id]
    return { id: summary.id, name: summary.name, slotCount: slots?.length ?? summary.slotCount, filledCount: slots?.filter(Boolean).length ?? 0, thumbnailUrl: frameThumb(summary) }
  })

  // "Gửi khung cho quán": several finished frames in one tap (signatures stop re-sending unchanged frames).
  const [sending, setSending] = useState(false)
  const [sendMessage, setSendMessage] = useState<string | null>(null)
  const [sentCount, setSentCount] = useState<number | null>(null)
  const [sendStates, setSendStates] = useState<Record<string, { state: FrameSendState; progress?: number }>>({})
  const sentKey = customerSession ? `caspace.sent-frames.${customerSession.sessionId}` : null
  const [sentSignatures, setSentSignatures] = useState<{ key: string | null; value: Record<string, string> }>({ key: null, value: {} })
  const sentForSession = sentSignatures.key === sentKey ? sentSignatures.value : (() => { try { return sentKey ? JSON.parse(sessionStorage.getItem(sentKey) ?? '{}') as Record<string, string> : {} } catch { return {} } })()
  const sendRows: SendFrameRow[] = booth.roomTemplateSummaries.map((summary, index) => {
    const slots = booth.frameSlots[summary.id]
    const filled = isFrameFilled(slots)
    return { templateId: summary.id, frameNumber: index + 1, name: summary.name, thumbnailUrl: frameThumb(summary), slotCount: editorFrames[index]!.slotCount, filledCount: editorFrames[index]!.filledCount, filled, sent: filled && sentForSession[summary.id] === frameSignature(slots!), ...sendStates[summary.id] }
  })
  const sendSelectedFrames = async (templateIds: string[]) => {
    if (sending || !validPhone) return
    setSending(true)
    setSendMessage(null)
    setSentCount(null)
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
      if (firstError) console.warn('[send-frames] frame failed', firstError)
      if (failed) setSendMessage(`${results.length - failed ? `Đã gửi ${results.length - failed} khung. ` : ''}${failed} khung chưa gửi được. Kiểm tra mạng rồi bấm gửi lại.`)
      else setSentCount(results.length)
    } catch (reason) { console.warn('[send-frames] send failed', reason); setSendMessage('Không gửi được khung. Kiểm tra mạng rồi thử lại.') }
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
          navigate('/editor')
        },
      )
    }
    catch (reason) { booth.reportPhotoError(reason instanceof Error ? reason.message : 'Không mở được phòng này. Vui lòng thử lại.') }
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
          setSaveConfirmation(`Đã lưu ảnh khung ${String(frameNumber).padStart(2, '0')} về máy.`)
          if (saveConfirmationTimer.current !== null) window.clearTimeout(saveConfirmationTimer.current)
          saveConfirmationTimer.current = window.setTimeout(() => { saveConfirmationTimer.current = null; setSaveConfirmation(null) }, 2200)
        },
      )
    }
    catch (reason) { console.warn('[frame-save] failed', reason); booth.reportPhotoError('Không lưu được ảnh về máy. Vui lòng thử lại.') }
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
  // Old links to the removed picker / template steps land in the editor.
  useEffect(() => { if (pathname === '/booth-photos' || pathname === '/templates') navigate('/editor', true) }, [navigate, pathname])
  useEffect(() => { window.scrollTo(0, 0) }, [pathname])
  useEffect(() => () => remoteExportAssets.clear(), [remoteExportAssets])
  useEffect(() => () => { if (saveConfirmationTimer.current !== null) window.clearTimeout(saveConfirmationTimer.current) }, [])

  const roomsPage = <RoomSelectionPage error={booth.roomsError} loading={booth.roomsLoading} notice={booth.photoError} onBack={() => navigate('/')} onSelect={enterRoom} rooms={booth.rooms} templateCount={(roomId) => booth.templates.filter((template) => template.roomId === roomId).length} />
  if (pathname === '/') return <HomePage onContinue={continueFromPhone} phoneNumber={booth.phoneNumber} />
  if (pathname === '/rooms') return isValidPhoneNumber(booth.phoneNumber) ? roomsPage : <HomePage onContinue={continueFromPhone} phoneNumber={booth.phoneNumber} />
  if (pathname === '/booth-photos' || pathname === '/templates') return null
  const inFlow = pathname === '/editor' || pathname === '/gui-in'
  if (inFlow && !booth.draftReady) return null
  if (inFlow && !isValidPhoneNumber(booth.phoneNumber)) return <HomePage onContinue={continueFromPhone} phoneNumber={booth.phoneNumber} />
  if (inFlow && !booth.selectedTemplateId) return roomsPage
  if (pathname === '/gui-in' && validPhone) return <SendFramesPage message={sendMessage} onBack={() => navigate('/editor')} onContinueFrame={(frameNumber) => { booth.selectFrame(frameNumber - 1); navigate('/editor') }} onHome={() => navigate('/')} onRooms={() => navigate('/rooms')} onSend={(ids) => void sendSelectedFrames(ids)} phone={validPhone} roomName={booth.room ? displayRoomName(booth.room.name) : ''} rows={sendRows} sending={sending} sentCount={sentCount} />
  if (pathname === '/editor' && booth.selectedTemplateId && booth.templateReady) return <EditorErrorBoundary onError={booth.reportPhotoError}><ComposerPage allBwEnabled={booth.allBwEnabled} autoFillHasExistingPhotos={booth.autoFillHasExistingPhotos} autoFillPhotoCount={booth.autoFillPhotoCount} autoFillPreparing={booth.autoFillPreparing} backgroundUrl={editorBackground?.canonical === booth.template.backgroundUrl ? editorBackground.local : booth.template.backgroundUrl && !/^https?:/i.test(booth.template.backgroundUrl) ? booth.template.backgroundUrl : null} boothPhotos={boothPhotoList} downloading={downloading} frameIndex={booth.currentFrameIndex} frames={editorFrames} loadBoothOriginal={loadBoothOriginal} onAutoFillPhotos={booth.autoFillAllFrames} onBack={() => navigate('/rooms')} onClearPhotoError={booth.clearPhotoError} onCurrentSlotChange={booth.setCurrentSlot} onDownload={saveCurrentFrame} onOpenSendFrames={() => { setSendStates({}); setSendMessage(null); setSentCount(null); navigate('/gui-in') }} onPhotoError={booth.reportPhotoError} onPickFramePhotos={booth.addPhotosToFrame} onPickPhoto={booth.addPhotoToTarget} onRemove={booth.removeSlot} onSelectFrame={booth.selectFrame} onToggleAllBw={booth.toggleAllBw} onTransform={booth.updateTransform} photoError={booth.photoError} printSize={booth.roomTemplateSummaries[booth.currentFrameIndex]?.printSize} saveConfirmation={saveConfirmation} slots={booth.slots} template={booth.template} /></EditorErrorBoundary>
  return <NotFoundPage />
}
