import type { PrintSize } from '../types/export'

export const printSizes: PrintSize[] = [
  { id: '2x6', label: '2 × 6 in', widthInches: 2, heightInches: 6 },
  { id: '4x6', label: '4 × 6 in', widthInches: 4, heightInches: 6 },
  { id: '5x7', label: '5 × 7 in', widthInches: 5, heightInches: 7 },
  { id: '6x8', label: '6 × 8 in', widthInches: 6, heightInches: 8 },
  { id: 'custom', label: 'Custom size', widthInches: 4, heightInches: 6 },
]
