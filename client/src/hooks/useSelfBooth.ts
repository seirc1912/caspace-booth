import { useCallback, useEffect, useMemo, useRef, useState, type SetStateAction } from 'react'
import type { AppView, FilledSlot, ImageTransform, PhotoAsset } from '../types/selfBooth'
import { printTemplates } from '../data/templates'
import { loadPublishedRooms, loadPublishedTemplateDetail, loadPublishedTemplateSummaries } from '../services/catalog/SupabaseCatalogService'
import type { CustomerTemplate, CustomerTemplateSummary } from '../services/catalog/types'
import type { Room } from '../models/Room'
import { loadPhotoFile } from '../features/photos/imageLoader'
import { createInitialPhotoSlot } from '../features/photos/initialPhotoSlot'
import { assignPhotoToTarget, type DirectPhotoTarget } from '../features/photos/directPhotoTarget'
import { withPhotoFilter, type PhotoFilter } from '../features/photos/photoFilter'

const maximumPhotos = Number.MAX_SAFE_INTEGER
const journeyStorageKey = 'selfbooth.customer-journey.v1'
const supportedPhoto = (file: File) => file.type.startsWith('image/') || /\.(jpe?g|png|webp|gif|avif|heic|heif)$/i.test(file.name)

async function loadPhotos(files: File[], concurrency = 2) {
  const results: PromiseSettledResult<PhotoAsset>[] = new Array(files.length)
  let nextIndex = 0
  const worker = async () => {
    while (nextIndex < files.length) {
      const index = nextIndex++
      try { results[index] = { status: 'fulfilled', value: await loadPhotoFile(files[index]!) } }
      catch (reason) { results[index] = { status: 'rejected', reason } }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, files.length) }, worker))
  return results
}

export function useSelfBooth() {
  const [rooms, setRooms] = useState<Room[]>([])
  const [templateSummaries, setTemplateSummaries] = useState<CustomerTemplateSummary[]>([])
  const [templateDetails, setTemplateDetails] = useState<Record<string, CustomerTemplate>>({})
  const [roomsLoading, setRoomsLoading] = useState(true)
  const [roomsError, setRoomsError] = useState<string | null>(null)
  const storedJourney = useMemo(() => { try { return JSON.parse(sessionStorage.getItem(journeyStorageKey) ?? '{}') as { phoneNumber?: string; selectedRoomId?: string; selectedTemplateId?: string } } catch { return {} } }, [])
  const [view, setView] = useState<AppView>('templates')
  const [phoneNumber, setPhoneNumberState] = useState(storedJourney.phoneNumber ?? '')
  const [selectedRoomId, setSelectedRoomIdState] = useState(storedJourney.selectedRoomId ?? '')
  const [selectedTemplateId, setSelectedTemplateIdState] = useState(storedJourney.selectedTemplateId ?? '')
  const [frameSlots, setFrameSlots] = useState<Record<string, Array<FilledSlot | null>>>({})
  const [completedFrameIds, setCompletedFrameIds] = useState<string[]>([])
  const [currentSlot, setCurrentSlot] = useState<number | null>(null)
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<string[]>([])
  const [uploadedPhotos, setUploadedPhotos] = useState<PhotoAsset[]>([])
  const uploadedPhotosRef = useRef<PhotoAsset[]>([])
  const mountedRef = useRef(true)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const lastRandomOrder = useRef('')
  useEffect(() => { uploadedPhotosRef.current = uploadedPhotos }, [uploadedPhotos])
  useEffect(() => {
    let active = true
    void loadPublishedRooms()
      .then((next) => { if (active) setRooms(next) })
      .catch((reason) => { if (active) setRoomsError(reason instanceof Error ? reason.message : 'Unable to load available rooms.') })
      .finally(() => { if (active) setRoomsLoading(false) })
    void loadPublishedTemplateSummaries()
      .then((next) => { if (active) setTemplateSummaries(next) })
      .catch((reason) => { if (active) setPhotoError(reason instanceof Error ? reason.message : 'Unable to load published frames.') })
    return () => { active = false }
  }, [])
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      uploadedPhotosRef.current.forEach((photo) => { URL.revokeObjectURL(photo.src); if (photo.previewSrc) URL.revokeObjectURL(photo.previewSrc) })
    }
  }, [])

  const template = useMemo(
    () => templateDetails[selectedTemplateId] ?? { ...printTemplates[0]!, roomId: '', printSize: '' },
    [selectedTemplateId, templateDetails],
  )
  const room = useMemo(() => rooms.find((item) => item.id === selectedRoomId) ?? null, [rooms, selectedRoomId])
  const roomTemplateSummaries = useMemo(() => templateSummaries.filter((item) => item.roomId === selectedRoomId), [templateSummaries, selectedRoomId])
  const roomTemplates = useMemo(() => roomTemplateSummaries.map((item) => templateDetails[item.id]).filter((item): item is CustomerTemplate => Boolean(item)), [roomTemplateSummaries, templateDetails])
  const currentFrameIndex = Math.max(0, roomTemplateSummaries.findIndex((item) => item.id === selectedTemplateId))
  const slots = frameSlots[selectedTemplateId] ?? template.slots.map(() => null)
  const setSlots = useCallback((updater: SetStateAction<Array<FilledSlot | null>>) => {
    if (!selectedTemplateId) return
    setCompletedFrameIds((completed) => completed.filter((id) => id !== selectedTemplateId))
    setFrameSlots((current) => {
      const existing = current[selectedTemplateId] ?? template.slots.map(() => null)
      const next = typeof updater === 'function' ? updater(existing) : updater
      return { ...current, [selectedTemplateId]: next }
    })
  }, [selectedTemplateId, template.slots])
  const persistJourney = (next: { phoneNumber: string; selectedRoomId: string; selectedTemplateId: string }) => sessionStorage.setItem(journeyStorageKey, JSON.stringify(next))
  const setPhoneNumber = (value: string) => { setPhoneNumberState(value); persistJourney({ phoneNumber: value, selectedRoomId, selectedTemplateId }) }
  const ensureTemplateDetail = useCallback(async (id: string) => {
    const existing = templateDetails[id]
    if (existing) return existing
    const detail = await loadPublishedTemplateDetail(id)
    setTemplateDetails((current) => current[id] ? current : { ...current, [id]: detail })
    return detail
  }, [templateDetails])
  useEffect(() => {
    if (!selectedTemplateId || !templateSummaries.some((item) => item.id === selectedTemplateId) || templateDetails[selectedTemplateId]) return
    let active = true
    void loadPublishedTemplateDetail(selectedTemplateId)
      .then((detail) => { if (active) setTemplateDetails((current) => current[selectedTemplateId] ? current : { ...current, [selectedTemplateId]: detail }) })
      .catch((reason) => { if (active) setPhotoError(reason instanceof Error ? reason.message : 'Unable to load this frame.') })
    return () => { active = false }
  }, [selectedTemplateId, templateDetails, templateSummaries])
  const selectRoom = async (id: string) => {
    const summaries = templateSummaries.length ? templateSummaries : await loadPublishedTemplateSummaries()
    if (!templateSummaries.length) setTemplateSummaries(summaries)
    const firstTemplate = summaries.find((item) => item.roomId === id)
    if (!firstTemplate) throw new Error('No published frames are available in this Room.')
    const templateId = firstTemplate.id
    await ensureTemplateDetail(templateId)
    setSelectedRoomIdState(id); setSelectedTemplateIdState(templateId); setCurrentSlot(null)
    setCompletedFrameIds([]); setFrameSlots({})
    persistJourney({ phoneNumber, selectedRoomId: id, selectedTemplateId: templateId })
  }
  const selectTemplate = async (id: string) => {
    try { await ensureTemplateDetail(id) }
    catch (reason) { setPhotoError(reason instanceof Error ? reason.message : 'Unable to load this frame.'); return false }
    setSelectedTemplateIdState(id); setCurrentSlot(null)
    persistJourney({ phoneNumber, selectedRoomId, selectedTemplateId: id })
    return true
  }

  const openEditor = useCallback(() => {
    setSlots((current) => current.length ? current : template.slots.map(() => null))
    setCurrentSlot(null)
    setSelectedPhotoIds([])
    setView('editor')
  }, [setSlots, template.slots])

  const selectFrame = useCallback(async (index: number) => {
    const next = roomTemplateSummaries[index]
    if (!next) return false
    try { await ensureTemplateDetail(next.id) }
    catch (reason) { setPhotoError(reason instanceof Error ? reason.message : 'Unable to load this frame.'); return false }
    setSelectedTemplateIdState(next.id)
    setCurrentSlot(null)
    persistJourney({ phoneNumber, selectedRoomId, selectedTemplateId: next.id })
    return true
  }, [ensureTemplateDetail, roomTemplateSummaries, phoneNumber, selectedRoomId])

  const completeCurrentFrame = useCallback(() => {
    if (!selectedTemplateId || !slots.some(Boolean)) return false
    setCompletedFrameIds((current) => current.includes(selectedTemplateId) ? current : [...current, selectedTemplateId])
    return true
  }, [selectedTemplateId, slots])
  const uncompleteFrame = useCallback((templateId: string) => {
    setCompletedFrameIds((current) => current.filter((id) => id !== templateId))
  }, [])

  const fillEmpty = useCallback((photos: PhotoAsset[]) => {
    setSlots((current) => {
      const next = [...current]
      const emptyIndices = template.slots.map((slot, index) => ({ index, x: slot.x, y: slot.y })).filter(({ index }) => !next[index]).sort((left, right) => left.y - right.y || left.x - right.x).map(({ index }) => index)
      emptyIndices.forEach((slotIndex, photoIndex) => { const photo = photos[photoIndex]; if (photo) next[slotIndex] = createInitialPhotoSlot(photo) })
      return next
    })
  }, [setSlots, template.slots])

  const replaceSlot = useCallback((index: number, photo: PhotoAsset) => {
    setSlots((current) => current.map((slot, slotIndex) => (slotIndex === index ? createInitialPhotoSlot(photo) : slot)))
  }, [setSlots])

  const updateTransform = useCallback((index: number, transform: Partial<ImageTransform>) => {
    setSlots((current) => current.map((slot, slotIndex) => (
      slotIndex === index && slot
        ? { ...slot, transform: { ...slot.transform, ...transform } }
        : slot
    )))
  }, [setSlots])

  const updateFit = useCallback((index: number, fit: 'contain' | 'cover') => {
    setSlots((current) => current.map((slot, slotIndex) => slotIndex === index && slot ? { ...slot, fit } : slot))
  }, [setSlots])

  const updateFilter = useCallback((index: number, filter: PhotoFilter) => {
    setSlots((current) => current.map((slot, slotIndex) => slotIndex === index && slot ? withPhotoFilter(slot, filter) : slot))
  }, [setSlots])

  const removeSlot = useCallback((index: number) => {
    setSlots((current) => current.map((slot, slotIndex) => (slotIndex === index ? null : slot)))
  }, [setSlots])

  const randomFill = useCallback(() => {
    if (!uploadedPhotos.length) return
    const shuffled = [...uploadedPhotos]
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const target = Math.floor(Math.random() * (index + 1))
      ;[shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]]
    }

    const visibleOrder = shuffled.slice(0, template.slots.length)
    if (visibleOrder.map((photo) => photo.id).join() === lastRandomOrder.current) {
      visibleOrder.push(visibleOrder.shift()!)
    }
    lastRandomOrder.current = visibleOrder.map((photo) => photo.id).join()
    setSlots(visibleOrder.map(createInitialPhotoSlot))
  }, [setSlots, template.slots.length, uploadedPhotos])

  const addUploadedPhotos = useCallback(async (files: File[]) => {
    setPhotoError(null)
    const candidates = files.filter(supportedPhoto).slice(0, maximumPhotos - uploadedPhotos.length)
    const results = await loadPhotos(candidates)
    const photos = results.filter((result): result is PromiseFulfilledResult<PhotoAsset> => result.status === 'fulfilled').map((result) => result.value)
    const failure = results.find((result): result is PromiseRejectedResult => result.status === 'rejected')
    if (!mountedRef.current) { photos.forEach((photo) => { URL.revokeObjectURL(photo.src); if (photo.previewSrc) URL.revokeObjectURL(photo.previewSrc) }); return }
    if (photos.length) setUploadedPhotos((current) => [...current, ...photos].slice(0, maximumPhotos))
    if (failure) setPhotoError(failure.reason instanceof Error ? failure.reason.message : 'One or more images could not be loaded.')
  }, [uploadedPhotos.length])
  const addPhotoToTarget = useCallback(async (target: DirectPhotoTarget, file: File) => {
    if (!supportedPhoto(file)) return
    setPhotoError(null)
    let photo: PhotoAsset
    try { photo = await loadPhotoFile(file) }
    catch (reason) { if (mountedRef.current) setPhotoError(reason instanceof Error ? reason.message : 'The image could not be loaded.'); return }
    if (!mountedRef.current) { URL.revokeObjectURL(photo.src); if (photo.previewSrc) URL.revokeObjectURL(photo.previewSrc); return }
    setUploadedPhotos((current) => [...current, photo].slice(0, maximumPhotos))
    setFrameSlots((current) => assignPhotoToTarget(current, target, photo))
    setCompletedFrameIds((current) => current.filter((id) => id !== target.templateId))
  }, [])
  const addUploadedAssets = useCallback((photos: PhotoAsset[]) => {
    setUploadedPhotos((current) => {
      const known = new Set(current.map((photo) => photo.id))
      return [...photos.filter((photo) => !known.has(photo.id)), ...current].slice(0, maximumPhotos)
    })
  }, [])
  const resetSessionPhotos = useCallback(() => {
    setUploadedPhotos((current) => {
      current.forEach((photo) => {
        if (photo.src.startsWith('blob:')) window.setTimeout(() => URL.revokeObjectURL(photo.src), 60_000)
        if (photo.previewSrc?.startsWith('blob:')) window.setTimeout(() => URL.revokeObjectURL(photo.previewSrc!), 60_000)
      })
      return []
    })
    setFrameSlots({}); setCompletedFrameIds([])
  }, [])

  const deleteUploadedPhoto = useCallback((photoId: string) => {
    setUploadedPhotos((current) => {
      const photo = current.find((item) => item.id === photoId)
      if (photo) { URL.revokeObjectURL(photo.src); if (photo.previewSrc) URL.revokeObjectURL(photo.previewSrc) }
      return current.filter((item) => item.id !== photoId)
    })
    setFrameSlots((current) => Object.fromEntries(Object.entries(current).map(([id, savedSlots]) => [id, savedSlots.map((slot) => slot?.photo.id === photoId ? null : slot)])))
    setCompletedFrameIds([])
  }, [])

  const replaceUploadedPhoto = useCallback(async (photoId: string, file: File) => {
    if (!supportedPhoto(file)) return
    setPhotoError(null)
    let replacement: PhotoAsset
    try { replacement = await loadPhotoFile(file) } catch (reason) { if (mountedRef.current) setPhotoError(reason instanceof Error ? reason.message : 'The image could not be loaded.'); return }
    if (!mountedRef.current) { URL.revokeObjectURL(replacement.src); if (replacement.previewSrc) URL.revokeObjectURL(replacement.previewSrc); return }
    setUploadedPhotos((current) => current.map((photo) => {
      if (photo.id !== photoId) return photo
      URL.revokeObjectURL(photo.src)
      if (photo.previewSrc) URL.revokeObjectURL(photo.previewSrc)
      return replacement
    }))
    setFrameSlots((current) => Object.fromEntries(Object.entries(current).map(([id, savedSlots]) => [id, savedSlots.map((slot) => slot?.photo.id === photoId ? createInitialPhotoSlot(replacement) : slot)])))
    setCompletedFrameIds([])
  }, [])

  const moveUploadedPhoto = useCallback((photoId: string, direction: -1 | 1) => {
    setUploadedPhotos((current) => {
      const index = current.findIndex((photo) => photo.id === photoId)
      const target = index + direction
      if (index < 0 || target < 0 || target >= current.length) return current
      const next = [...current]
      ;[next[index], next[target]] = [next[target]!, next[index]!]
      return next
    })
  }, [])

  const shuffleSlots = useCallback(() => {
    setSlots((current) => {
      if (current.filter(Boolean).length < 2) return current

      const filled = current.filter((slot): slot is FilledSlot => Boolean(slot))
      const originalOrder = filled.map((slot) => slot.photo.id).join()
      for (let index = filled.length - 1; index > 0; index -= 1) {
        const target = Math.floor(Math.random() * (index + 1))
        ;[filled[index], filled[target]] = [filled[target], filled[index]]
      }

      if (filled.map((slot) => slot.photo.id).join() === originalOrder) {
        filled.push(filled.shift()!)
      }

      let filledIndex = 0
      return current.map((slot) => (slot ? filled[filledIndex++] : null))
    })
  }, [setSlots])

  const toggleSelectedPhoto = useCallback((id: string) => {
    setSelectedPhotoIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
  }, [])
  const clearPhotoError = useCallback((expected?: string) => setPhotoError((current) => expected && current !== expected ? current : null), [])
  const reportPhotoError = useCallback((message: string) => setPhotoError(message), [])

  return {
    view,
    setView,
    template,
    templateReady: Boolean(selectedTemplateId && templateDetails[selectedTemplateId]),
    rooms,
    roomsLoading,
    roomsError,
    room,
    roomTemplates,
    roomTemplateSummaries,
    frameSlots,
    completedFrameIds,
    currentFrameIndex,
    templates: templateSummaries,
    phoneNumber,
    setPhoneNumber,
    selectedRoomId,
    selectRoom,
    selectedTemplateId,
    selectTemplate,
    selectFrame,
    completeCurrentFrame,
    uncompleteFrame,
    slots,
    currentSlot,
    setCurrentSlot,
    selectedPhotoIds,
    uploadedPhotos,
    photoError,
    clearPhotoError,
    reportPhotoError,
    maximumPhotos,
    addUploadedPhotos,
    addPhotoToTarget,
    addUploadedAssets,
    resetSessionPhotos,
    deleteUploadedPhoto,
    replaceUploadedPhoto,
    moveUploadedPhoto,
    toggleSelectedPhoto,
    clearSelectedPhotos: () => setSelectedPhotoIds([]),
    openEditor,
    fillEmpty,
    replaceSlot,
    updateTransform,
    updateFit,
    updateFilter,
    removeSlot,
    clearAll: () => setSlots((current) => current.map(() => null)),
    randomFill,
    shuffleSlots,
  }
}
