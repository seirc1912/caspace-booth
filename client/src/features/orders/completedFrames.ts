import type { FilledSlot, PrintTemplate } from '../../types/selfBooth'

export interface OrderFrame {
  template: Pick<PrintTemplate, 'id' | 'slots'>
  index: number
  slots: Array<FilledSlot | null>
}

export const isFrameComplete = (frame: OrderFrame) => (
  frame.slots.length === frame.template.slots.length && frame.slots.every(Boolean)
)

export const completedFramesForOrder = <Frame extends OrderFrame>(frames: Frame[]) => frames.filter(isFrameComplete)
