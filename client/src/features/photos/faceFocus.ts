import { PORTRAIT_FOCUS } from './slotTransform'

interface DetectedFace { boundingBox: { x: number; y: number; width: number; height: number } }
type FaceDetectorConstructor = new (options?: { fastMode?: boolean; maxDetectedFaces?: number }) => { detect: (image: ImageBitmapSource) => Promise<DetectedFace[]> }

/**
 * Where to centre a photo in its slot (fractions of the photo, 0–1): the middle of the detected
 * faces when the browser has the on-device FaceDetector API (Chrome on Android/macOS), otherwise
 * the portrait default — centred, ~20% above the middle. Never uploads the photo anywhere.
 */
export async function photoFocus(image: HTMLImageElement): Promise<{ x: number; y: number }> {
  const Detector = (globalThis as { FaceDetector?: FaceDetectorConstructor }).FaceDetector
  if (!Detector || !image.naturalWidth || !image.naturalHeight) return PORTRAIT_FOCUS
  try {
    const faces = await new Detector({ fastMode: true, maxDetectedFaces: 10 }).detect(image)
    if (!faces.length) return PORTRAIT_FOCUS
    const left = Math.min(...faces.map((face) => face.boundingBox.x))
    const right = Math.max(...faces.map((face) => face.boundingBox.x + face.boundingBox.width))
    const top = Math.min(...faces.map((face) => face.boundingBox.y))
    const bottom = Math.max(...faces.map((face) => face.boundingBox.y + face.boundingBox.height))
    return { x: (left + right) / 2 / image.naturalWidth, y: (top + bottom) / 2 / image.naturalHeight }
  } catch { return PORTRAIT_FOCUS }
}
