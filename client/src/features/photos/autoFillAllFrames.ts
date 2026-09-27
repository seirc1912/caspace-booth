import type { FilledSlot, PhotoAsset } from '../../types/selfBooth'
import type { CustomerTemplate, CustomerTemplateSummary } from '../../services/catalog/types'
import { createPhotoSlotForAllBw } from './allBwFilter'

export async function resolveRoomTemplateDetails(
  summaries: CustomerTemplateSummary[],
  cached: Record<string, CustomerTemplate>,
  ensureTemplateDetail: (id: string) => Promise<CustomerTemplate>,
  concurrency = 2,
) {
  const details: Array<CustomerTemplate | undefined> = summaries.map((summary) => cached[summary.id])
  let nextIndex = 0
  const worker = async () => {
    while (nextIndex < summaries.length) {
      const index = nextIndex++
      if (!details[index]) details[index] = await ensureTemplateDetail(summaries[index]!.id)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, summaries.length) }, worker))
  return details.filter((detail): detail is CustomerTemplate => Boolean(detail))
}

export function totalRoomSlotCount(templates: CustomerTemplate[]) {
  return templates.reduce((total, template) => total + template.slots.length, 0)
}

export function collectAutoFillPhotoResults(results: PromiseSettledResult<PhotoAsset>[]) {
  return {
    photos: results.filter((result): result is PromiseFulfilledResult<PhotoAsset> => result.status === 'fulfilled').map((result) => result.value),
    failure: results.find((result): result is PromiseRejectedResult => result.status === 'rejected'),
  }
}

function shuffleOnce<T>(items: T[], random = Math.random) {
  const shuffled = [...items]
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1))
    ;[shuffled[index], shuffled[target]] = [shuffled[target]!, shuffled[index]!]
  }
  return shuffled
}

export function shufflePhotosOnce(photos: PhotoAsset[], random = Math.random) {
  return shuffleOnce(photos, random)
}

export function assignPhotosAcrossRoom(
  frameSlots: Record<string, Array<FilledSlot | null>>,
  templates: CustomerTemplate[],
  photos: PhotoAsset[],
  allBwEnabled: boolean,
  random = Math.random,
) {
  const capacity = totalRoomSlotCount(templates)
  if (capacity < 1 || photos.length < 1) return frameSlots
  const shuffledPhotos = shufflePhotosOnce(photos.slice(0, capacity), random)
  const shuffledSlotIndexes = shuffleOnce(Array.from({ length: capacity }, (_, index) => index), random)
  const assignments = new Map(shuffledSlotIndexes.slice(0, shuffledPhotos.length).map((slotIndex, index) => [slotIndex, shuffledPhotos[index]!]))
  let slotIndex = 0
  const next = { ...frameSlots }
  for (const template of templates) {
    next[template.id] = template.slots.map(() => {
      const photo = assignments.get(slotIndex++)
      return photo ? createPhotoSlotForAllBw(photo, allBwEnabled) : null
    })
  }
  return next
}

export function roomHasAssignedPhotos(frameSlots: Record<string, Array<FilledSlot | null>>, templateIds: string[]) {
  return templateIds.some((id) => frameSlots[id]?.some(Boolean))
}

export function invalidateCompletedRoomFrames(completedFrameIds: string[], templateIds: string[]) {
  const changedFrames = new Set(templateIds)
  return completedFrameIds.filter((id) => !changedFrames.has(id))
}
