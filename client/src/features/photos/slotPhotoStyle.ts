import type { CSSProperties } from 'react'
import type { SlotTransform } from '../../types/selfBooth'
import { photoFilterCss } from './photoFilter'
import { placePhoto, type Size } from './slotTransform'

/** CSS for a photo inside a slot box: the same placement the print file uses (percentages of the slot). */
export function slotPhotoStyle(transform: SlotTransform, photo: Size, slot: Size): CSSProperties {
  const placement = placePhoto(transform, photo, slot)
  return {
    width: `${placement.width / slot.width * 100}%`,
    height: `${placement.height / slot.height * 100}%`,
    left: `${placement.centerX / slot.width * 100}%`,
    top: `${placement.centerY / slot.height * 100}%`,
    transform: `translate(-50%, -50%) rotate(${placement.rotation}deg) scaleX(${placement.flipX ? -1 : 1})`,
    filter: photoFilterCss(transform.grayscale),
  }
}
