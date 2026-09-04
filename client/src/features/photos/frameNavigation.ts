export function nextFrameIndex(currentIndex: number, frameCount: number) {
  const nextIndex = currentIndex + 1
  return nextIndex < frameCount ? nextIndex : null
}
