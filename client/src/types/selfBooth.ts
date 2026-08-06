export type AppView = 'templates' | 'editor' | 'preview'

export interface TemplateCanvasSize {
  width: number
  height: number
}

export interface TemplateAssets {
  background: string
  thumbnail: string
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

export type TemplateElementType = 'text' | 'logo' | 'sticker' | 'shape' | 'qrCode' | 'dynamicVariable'

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
  variableType?: TemplateVariableType | 'sessionId'
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
}

export interface PrintTemplate extends TemplateDocument {
  slotCount: number
  backgroundUrl: string | null
  thumbnailUrl: string | null
}

export interface PhotoAsset {
  id: string
  src: string
  alt: string
  source: 'selfbooth' | 'phone'
}

export interface ImageTransform {
  zoom: number
  rotation: number
  x: number
  y: number
}

export interface FilledSlot {
  photo: PhotoAsset
  transform: ImageTransform
}
