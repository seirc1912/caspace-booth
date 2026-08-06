import type { Brand, BrandUpdate } from '../../models/Brand'

export interface BrandService {
  getById(brandId: string): Promise<Brand>
  getByHost(host: string): Promise<Brand>
  update(input: BrandUpdate): Promise<Brand>
}
