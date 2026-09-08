import type { FilledSlot, PhotoAsset } from '../../types/selfBooth'

const databaseName = 'selfbooth-customer-drafts'
const databaseVersion = 1
const draftStoreName = 'drafts'
const photoStoreName = 'photos'
export const editorDraftTtlMs = 24 * 60 * 60 * 1000

export interface EditorDraftIdentity {
  sessionId: string
  boothId: string
  phoneNumber: string
}

interface StoredPhoto {
  key: string
  scopeKey: string
  photoId: string
  blob: Blob
  previewBlob?: Blob
  alt: string
  source: PhotoAsset['source']
  updatedAt: number
}

export interface StoredSlot {
  photoId: string
  transform: FilledSlot['transform']
  fit?: FilledSlot['fit']
  filter?: FilledSlot['filter']
}

export interface EditorDraftMetadata {
  scopeKey: string
  sessionId: string
  roomId: string
  phoneNumber: string
  selectedTemplateId: string
  currentSlot: number | null
  frameSlots: Record<string, Array<StoredSlot | null>>
  completedFrameIds: string[]
  uploadedPhotoIds: string[]
  updatedAt: number
}

export interface EditorDraftState {
  roomId: string
  selectedTemplateId: string
  currentSlot: number | null
  frameSlots: Record<string, Array<FilledSlot | null>>
  completedFrameIds: string[]
  uploadedPhotos: PhotoAsset[]
}

const requestResult = <T>(request: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
  request.onsuccess = () => resolve(request.result)
  request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'))
})

const transactionDone = (transaction: IDBTransaction) => new Promise<void>((resolve, reject) => {
  transaction.oncomplete = () => resolve()
  transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction was aborted'))
  transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed'))
})

const openDatabase = () => new Promise<IDBDatabase>((resolve, reject) => {
  if (!globalThis.indexedDB) { reject(new Error('IndexedDB is unavailable')); return }
  const request = indexedDB.open(databaseName, databaseVersion)
  request.onupgradeneeded = () => {
    const database = request.result
    if (!database.objectStoreNames.contains(draftStoreName)) database.createObjectStore(draftStoreName, { keyPath: 'scopeKey' })
    if (!database.objectStoreNames.contains(photoStoreName)) {
      const photos = database.createObjectStore(photoStoreName, { keyPath: 'key' })
      photos.createIndex('scopeKey', 'scopeKey', { unique: false })
    }
  }
  request.onsuccess = () => resolve(request.result)
  request.onerror = () => reject(request.error ?? new Error('IndexedDB could not be opened'))
})

const withDatabase = async <T>(operation: (database: IDBDatabase) => Promise<T>) => {
  const database = await openDatabase()
  try { return await operation(database) } finally { database.close() }
}

export function editorDraftScopeKey(identity: EditorDraftIdentity) {
  return `v1:${encodeURIComponent(identity.sessionId)}:${encodeURIComponent(identity.boothId)}:${encodeURIComponent(identity.phoneNumber)}`
}

export function serializeFrameSlots(frameSlots: Record<string, Array<FilledSlot | null>>) {
  return Object.fromEntries(Object.entries(frameSlots).map(([templateId, slots]) => [templateId, slots.map((slot) => slot ? {
    photoId: slot.photo.id,
    transform: { ...slot.transform },
    fit: slot.fit,
    filter: slot.filter,
  } : null)]))
}

export function createEditorDraftMetadata(identity: EditorDraftIdentity, state: Omit<EditorDraftState, 'uploadedPhotos'>, uploadedPhotoIds: string[], now = Date.now()): EditorDraftMetadata {
  return {
    scopeKey: editorDraftScopeKey(identity), sessionId: identity.sessionId, roomId: state.roomId,
    phoneNumber: identity.phoneNumber, selectedTemplateId: state.selectedTemplateId, currentSlot: state.currentSlot,
    frameSlots: serializeFrameSlots(state.frameSlots), completedFrameIds: [...state.completedFrameIds],
    uploadedPhotoIds: [...uploadedPhotoIds], updatedAt: now,
  }
}

export function hydrateEditorDraft(metadata: EditorDraftMetadata, photos: PhotoAsset[]): EditorDraftState | null {
  if (!metadata || typeof metadata.roomId !== 'string' || typeof metadata.selectedTemplateId !== 'string' || !Array.isArray(metadata.completedFrameIds)) return null
  const byId = new Map(photos.map((photo) => [photo.id, photo]))
  const frameSlots = Object.fromEntries(Object.entries(metadata.frameSlots ?? {}).map(([templateId, slots]) => [templateId, Array.isArray(slots) ? slots.map((slot) => {
    if (!slot || typeof slot.photoId !== 'string') return null
    const photo = byId.get(slot.photoId)
    if (!photo || !slot.transform || !Number.isFinite(slot.transform.zoom) || !Number.isFinite(slot.transform.x) || !Number.isFinite(slot.transform.y) || !Number.isFinite(slot.transform.rotation)) return null
    return { photo, transform: { ...slot.transform }, fit: slot.fit === 'cover' ? 'cover' : 'contain', filter: slot.filter === 'grayscale' ? 'grayscale' : 'none' } satisfies FilledSlot
  }) : []]))
  return {
    roomId: metadata.roomId,
    selectedTemplateId: metadata.selectedTemplateId,
    currentSlot: Number.isInteger(metadata.currentSlot) && (metadata.currentSlot as number) >= 0 ? metadata.currentSlot : null,
    frameSlots,
    completedFrameIds: metadata.completedFrameIds.filter((id): id is string => typeof id === 'string'),
    uploadedPhotos: metadata.uploadedPhotoIds.map((id) => byId.get(id)).filter((photo): photo is PhotoAsset => Boolean(photo)),
  }
}

export function editorDraftPhotoIds(metadata: EditorDraftMetadata) {
  const ids = new Set(metadata.uploadedPhotoIds)
  Object.values(metadata.frameSlots ?? {}).forEach((slots) => slots?.forEach((slot) => { if (slot?.photoId) ids.add(slot.photoId) }))
  return ids
}

async function urlBlob(url: string) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Photo could not be read (${response.status})`)
  return response.blob()
}

export async function persistPhotoOnce(scopeKey: string, photo: PhotoAsset) {
  const key = `${scopeKey}:${photo.id}`
  return withDatabase(async (database) => {
    const check = database.transaction(photoStoreName, 'readonly')
    if (await requestResult(check.objectStore(photoStoreName).getKey(key))) return false
    const [blob, previewBlob] = await Promise.all([urlBlob(photo.src), photo.previewSrc && photo.previewSrc !== photo.src ? urlBlob(photo.previewSrc) : undefined])
    const transaction = database.transaction(photoStoreName, 'readwrite')
    const store = transaction.objectStore(photoStoreName)
    if (!await requestResult(store.getKey(key))) store.put({ key, scopeKey, photoId: photo.id, blob, previewBlob, alt: photo.alt, source: photo.source, updatedAt: Date.now() } satisfies StoredPhoto)
    await transactionDone(transaction)
    return true
  })
}

export async function saveEditorDraft(metadata: EditorDraftMetadata) {
  await withDatabase(async (database) => {
    const transaction = database.transaction([draftStoreName, photoStoreName], 'readwrite')
    transaction.objectStore(draftStoreName).put(metadata)
    const photoStore = transaction.objectStore(photoStoreName)
    const records = await requestResult(photoStore.index('scopeKey').getAll(metadata.scopeKey)) as StoredPhoto[]
    const retainedIds = editorDraftPhotoIds(metadata)
    records.forEach((record) => { if (!retainedIds.has(record.photoId)) photoStore.delete(record.key) })
    await transactionDone(transaction)
  })
}

export async function loadEditorDraft(identity: EditorDraftIdentity): Promise<EditorDraftState | null> {
  const scopeKey = editorDraftScopeKey(identity)
  return withDatabase(async (database) => {
    const draftTransaction = database.transaction(draftStoreName, 'readonly')
    const metadata = await requestResult(draftTransaction.objectStore(draftStoreName).get(scopeKey)) as EditorDraftMetadata | undefined
    if (!metadata || metadata.sessionId !== identity.sessionId || metadata.roomId !== identity.boothId || metadata.phoneNumber !== identity.phoneNumber || Date.now() - metadata.updatedAt > editorDraftTtlMs) return null
    const photoTransaction = database.transaction(photoStoreName, 'readonly')
    const records = await requestResult(photoTransaction.objectStore(photoStoreName).index('scopeKey').getAll(scopeKey)) as StoredPhoto[]
    const neededPhotoIds = editorDraftPhotoIds(metadata)
    const photos = records.flatMap((record) => neededPhotoIds.has(record.photoId) && record?.blob instanceof Blob ? [{
      id: record.photoId,
      src: URL.createObjectURL(record.blob),
      previewSrc: URL.createObjectURL(record.previewBlob ?? record.blob),
      alt: record.alt,
      source: record.source,
    } satisfies PhotoAsset] : [])
    const hydrated = hydrateEditorDraft(metadata, photos)
    if (!hydrated) photos.forEach((photo) => { URL.revokeObjectURL(photo.src); if (photo.previewSrc) URL.revokeObjectURL(photo.previewSrc) })
    return hydrated
  })
}

export async function clearEditorDraft(scopeKey: string) {
  await withDatabase(async (database) => {
    const transaction = database.transaction([draftStoreName, photoStoreName], 'readwrite')
    transaction.objectStore(draftStoreName).delete(scopeKey)
    const photoStore = transaction.objectStore(photoStoreName)
    const keys = await requestResult(photoStore.index('scopeKey').getAllKeys(scopeKey))
    keys.forEach((key) => photoStore.delete(key))
    await transactionDone(transaction)
  })
}

export async function cleanupAbandonedEditorDrafts(activeScopeKey: string | null, now = Date.now()) {
  await withDatabase(async (database) => {
    const read = database.transaction(draftStoreName, 'readonly')
    const drafts = await requestResult(read.objectStore(draftStoreName).getAll()) as EditorDraftMetadata[]
    const expired = new Set(drafts.filter((draft) => draft.scopeKey !== activeScopeKey && now - draft.updatedAt > editorDraftTtlMs).map((draft) => draft.scopeKey))
    const draftScopes = new Set(drafts.map((draft) => draft.scopeKey))
    const transaction = database.transaction([draftStoreName, photoStoreName], 'readwrite')
    const draftStore = transaction.objectStore(draftStoreName)
    const photoStore = transaction.objectStore(photoStoreName)
    expired.forEach((scopeKey) => draftStore.delete(scopeKey))
    const photos = await requestResult(photoStore.getAll()) as StoredPhoto[]
    photos.forEach((photo) => {
      const abandonedOrphan = photo.scopeKey !== activeScopeKey && !draftScopes.has(photo.scopeKey) && now - photo.updatedAt > editorDraftTtlMs
      if (expired.has(photo.scopeKey) || abandonedOrphan) photoStore.delete(photo.key)
    })
    await transactionDone(transaction)
  })
}
