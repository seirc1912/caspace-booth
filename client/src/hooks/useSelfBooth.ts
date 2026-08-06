import { useCallback, useMemo, useRef, useState } from 'react'
import { samplePhotos } from '../data/samplePhotos'
import { printTemplates } from '../data/templates'
import type { AppView, FilledSlot, ImageTransform, PhotoAsset } from '../types/selfBooth'

const initialTransform: ImageTransform = { zoom: 1, rotation: 0, x: 0, y: 0 }

function toSlot(photo: PhotoAsset): FilledSlot {
  return { photo, transform: { ...initialTransform } }
}

export function useSelfBooth() {
  const [view, setView] = useState<AppView>('templates')
  const [selectedTemplateId, setSelectedTemplateId] = useState(printTemplates[0].id)
  const [slots, setSlots] = useState<Array<FilledSlot | null>>([])
  const [currentSlot, setCurrentSlot] = useState<number | null>(null)
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<string[]>([])
  const lastRandomOrder = useRef('')

  const template = useMemo(
    () => printTemplates.find((item) => item.id === selectedTemplateId) ?? printTemplates[0],
    [selectedTemplateId],
  )

  const openEditor = useCallback(() => {
    setSlots(template.slots.map(() => null))
    setCurrentSlot(null)
    setSelectedPhotoIds([])
    setView('editor')
  }, [template.slots])

  const fillEmpty = useCallback((photos: PhotoAsset[]) => {
    setSlots((current) => {
      let photoIndex = 0
      return current.map((slot) => {
        if (slot || !photos[photoIndex]) return slot
        return toSlot(photos[photoIndex++])
      })
    })
  }, [])

  const replaceSlot = useCallback((index: number, photo: PhotoAsset) => {
    setSlots((current) => current.map((slot, slotIndex) => (slotIndex === index ? toSlot(photo) : slot)))
  }, [])

  const updateTransform = useCallback((index: number, transform: Partial<ImageTransform>) => {
    setSlots((current) => current.map((slot, slotIndex) => (
      slotIndex === index && slot
        ? { ...slot, transform: { ...slot.transform, ...transform } }
        : slot
    )))
  }, [])

  const removeSlot = useCallback((index: number) => {
    setSlots((current) => current.map((slot, slotIndex) => (slotIndex === index ? null : slot)))
  }, [])

  const randomFill = useCallback(() => {
    const shuffled = [...samplePhotos]
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const target = Math.floor(Math.random() * (index + 1))
      ;[shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]]
    }

    const visibleOrder = shuffled.slice(0, template.slots.length)
    if (visibleOrder.map((photo) => photo.id).join() === lastRandomOrder.current) {
      visibleOrder.push(visibleOrder.shift()!)
    }
    lastRandomOrder.current = visibleOrder.map((photo) => photo.id).join()
    setSlots(visibleOrder.map(toSlot))
  }, [template.slots.length])

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
  }, [])

  const toggleSelectedPhoto = useCallback((id: string) => {
    setSelectedPhotoIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
  }, [])

  return {
    view,
    setView,
    template,
    templates: printTemplates,
    selectedTemplateId,
    selectTemplate: setSelectedTemplateId,
    slots,
    currentSlot,
    setCurrentSlot,
    selectedPhotoIds,
    toggleSelectedPhoto,
    clearSelectedPhotos: () => setSelectedPhotoIds([]),
    openEditor,
    fillEmpty,
    replaceSlot,
    updateTransform,
    removeSlot,
    clearAll: () => setSlots((current) => current.map(() => null)),
    randomFill,
    shuffleSlots,
  }
}
