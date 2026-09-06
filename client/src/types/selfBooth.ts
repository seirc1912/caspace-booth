export type AppView = 'templates' | 'editor' | 'preview'

export interface TemplateCanvasSize {
  width: number
  height: number
}

export interface TemplateAssets {
  background: string
  thumbnail: string
  cover?: string
}

export interface TemplateSlot {
  id: string
  name?: string
  x: number
  y: number
  width: number
  height: number
  rotation: number
  borderRadius: number
  lockAspectRatio: boolean
  zIndex: number
  opacity?: number
  visible?: boolean
  locked?: boolean
  mask?: 'rectangle' | 'rounded' | 'circle' | 'ellipse'
  cropMode?: 'cover' | 'contain'
  editableRules?: PhotoSlotEditableRules
  photoIndex?: number
  aspectRatio?: 'free' | '1:1' | '3:4' | '4:3' | '9:16'
  borderWidth?: number
  borderColor?: string
  shadow?: { color: string; blur: number; offsetX: number; offsetY: number }
}

export interface PhotoSlotEditableRules {
  canReplace: boolean
  canMove: boolean
  canZoom: boolean
  canRotate: boolean
}

export interface ElementEditableRules {
  canEdit: boolean
  canMove: boolean
  canResize: boolean
  canRotate: boolean
}

export type TemplateVariableType = 'brandLogo' | 'brandName' | 'website' | 'date' | 'time' | 'qrCode' | 'customText'

export interface TemplateVariable {
  id: string
  type: TemplateVariableType
  value?: string
  x: number
  y: number
  width: number
  height: number
  fontSize: number
  color: string
  align: 'left' | 'center' | 'right'
  zIndex: number
}

export type TemplateElementType = 'text' | 'image' | 'logo' | 'sticker' | 'overlay' | 'shape' | 'qrCode' | 'dynamicVariable'

export interface TemplateElement {
  id: string
  type: TemplateElementType
  name: string
  x: number
  y: number
  width: number
  height: number
  rotation: number
  opacity: number
  zIndex: number
  visible: boolean
  locked: boolean
  content?: string
  assetUrl?: string
  shape?: 'rectangle' | 'circle' | 'line' | 'svg'
  fill?: string
  stroke?: string
  customSvg?: string
  fontFamily?: string
  fontSize?: number
  fontWeight?: number
  textAlign?: 'left' | 'center' | 'right'
  color?: string
  letterSpacing?: number
  shadowColor?: string
  shadowBlur?: number
  shadowX?: number
  shadowY?: number
  variableType?: TemplateVariableType | 'sessionId'
  editableRules?: ElementEditableRules
}

export interface TemplateGuideSettings {
  snapToGrid: boolean
  gridSize: number
  showSafeArea: boolean
  showTrimLine: boolean
  showBleedArea: boolean
}

export interface TemplateLayerReference {
  id: string
  type: 'background' | 'photoSlot' | TemplateElementType | 'dynamicVariable'
  zIndex: number
}

export interface TemplateDocument {
  schemaVersion: 1
  id: string
  name: string
  canvas: TemplateCanvasSize
  assets: TemplateAssets
  backgroundColor: string
  slots: TemplateSlot[]
  variables: TemplateVariable[]
  elements: TemplateElement[]
  layers?: TemplateLayerReference[]
  settings?: TemplateGuideSettings
}

export interface PrintTemplate extends TemplateDocument {
  slotCount: number
  backgroundUrl: string | null
  thumbnailUrl: string | null
}

export interface PhotoAsset {
  id: string
  src: string
  previewSrc?: string
  alt: string
  source: 'selfbooth' | 'phone'
}

export interface ImageTransform {
  zoom: number
  rotation: number
  x: number
  y: number
  flipX?: boolean
  flipY?: boolean
}

export interface FilledSlot {
  photo: PhotoAsset
  transform: ImageTransform
  fit?: 'contain' | 'cover'
  filter?: 'none' | 'grayscale'
}
