/** iPhone/iPad save photos through the share sheet ("Lưu hình ảnh"); Android and desktop download straight to the device. */
export function prefersShareSheet(userAgent = navigator.userAgent, maxTouchPoints = navigator.maxTouchPoints) {
  return /iPhone|iPad|iPod/i.test(userAgent) || (/Macintosh/i.test(userAgent) && maxTouchPoints > 1)
}
