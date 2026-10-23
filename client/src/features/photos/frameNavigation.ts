export function nextFrameIndex(currentIndex: number, frameCount: number) {
  const nextIndex = currentIndex + 1
  return nextIndex < frameCount ? nextIndex : null
}

export function frameSelectorScrollTarget(containerLeft: number, containerRight: number, itemLeft: number, itemRight: number, scrollLeft: number) {
  const edgePadding = 8
  if (itemLeft < containerLeft) return Math.max(0, scrollLeft + itemLeft - containerLeft - edgePadding)
  if (itemRight > containerRight) return scrollLeft + itemRight - containerRight + edgePadding
  return scrollLeft
}
