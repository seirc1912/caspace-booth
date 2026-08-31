import type { PrintTemplate } from '../../types/selfBooth'

export interface CustomerTemplate extends PrintTemplate {
  roomId: string
  printSize: string
}

export interface CustomerTemplateSummary {
  id: string
  roomId: string
  name: string
  thumbnailUrl: string | null
  printSize: string
  slotCount: number
  displayOrder: number
}
