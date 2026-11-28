import { PORTRAIT_FOCUS } from './slotTransform'

interface Box { x: number; y: number; width: number; height: number }
type FaceDetectorConstructor = new (options?: { fastMode?: boolean; maxDetectedFaces?: number }) => { detect: (image: ImageBitmapSource) => Promise<Array<{ boundingBox: Box }>> }
interface MediaPipeDetector { detect: (image: HTMLImageElement) => { detections: Array<{ boundingBox?: { originX: number; originY: number; width: number; height: number } }> } }

/** Same version as package.json; the 15 MB runtime is fetched from the CDN only when first needed. */
const MEDIAPIPE_WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/wasm'
/** BlazeFace short-range (~230 KB), served from caspace.vn. */
const FACE_MODEL = '/models/blaze_face_short_range.tflite'
/** A slow phone keeps the portrait default instead of waiting; the detector keeps loading for later photos. */
const DETECTOR_WAIT_MS = 8_000

let mediaPipe: Promise<MediaPipeDetector | null> | null = null

/** Loads MediaPipe Face Detection once per page; null when it cannot run (old browser, offline). */
function loadMediaPipe() {
  mediaPipe ??= import('@mediapipe/tasks-vision').then(async ({ FaceDetector, FilesetResolver }) => {
    const fileset = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM)
    const options = (delegate: 'GPU' | 'CPU') => ({ baseOptions: { modelAssetPath: FACE_MODEL, delegate }, runningMode: 'IMAGE' as const, minDetectionConfidence: 0.5 })
    return await FaceDetector.createFromOptions(fileset, options('GPU')).catch(() => FaceDetector.createFromOptions(fileset, options('CPU'))) as MediaPipeDetector
  }).catch(() => null)
  return mediaPipe
}

const within = <T,>(promise: Promise<T>, ms: number) => Promise.race([promise, new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))])

function centreOf(boxes: Box[], image: HTMLImageElement) {
  if (!boxes.length) return null
  const left = Math.min(...boxes.map((box) => box.x))
  const right = Math.max(...boxes.map((box) => box.x + box.width))
  const top = Math.min(...boxes.map((box) => box.y))
  const bottom = Math.max(...boxes.map((box) => box.y + box.height))
  return { x: (left + right) / 2 / image.naturalWidth, y: (top + bottom) / 2 / image.naturalHeight }
}

/**
 * Where to centre a photo in its slot (fractions of the photo, 0–1): the middle of the detected
 * faces — the browser's own FaceDetector where it exists (Chrome), otherwise MediaPipe Face
 * Detection (also iPhone Safari). No face, or a detector that cannot run: the portrait default,
 * centred and ~20% above the middle. Detection runs on the phone; the photo never leaves it.
 */
export async function photoFocus(image: HTMLImageElement): Promise<{ x: number; y: number }> {
  if (!image.naturalWidth || !image.naturalHeight) return PORTRAIT_FOCUS
  const Native = (globalThis as { FaceDetector?: FaceDetectorConstructor }).FaceDetector
  if (Native) {
    try { return centreOf((await new Native({ fastMode: true, maxDetectedFaces: 10 }).detect(image)).map((face) => face.boundingBox), image) ?? PORTRAIT_FOCUS }
    catch { /* fall through to MediaPipe */ }
  }
  const detector = await within(loadMediaPipe(), DETECTOR_WAIT_MS)
  if (!detector) return PORTRAIT_FOCUS
  try {
    const boxes = detector.detect(image).detections.flatMap((face) => face.boundingBox ? [{ x: face.boundingBox.originX, y: face.boundingBox.originY, width: face.boundingBox.width, height: face.boundingBox.height }] : [])
    return centreOf(boxes, image) ?? PORTRAIT_FOCUS
  } catch { return PORTRAIT_FOCUS }
}
