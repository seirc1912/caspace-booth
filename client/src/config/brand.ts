import type { Brand } from '../models/Brand'
import { branding } from './branding'

export const defaultBrand: Readonly<Brand> = Object.freeze({
  ...branding,
  id: 'ca-space',
  status: 'active',
})
