import type { PrintTemplate } from '../../types/selfBooth'

export interface CustomerTemplate extends PrintTemplate {
  roomId: string
  printSize: string
}
