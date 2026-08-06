import { env } from './env'

export interface StorageConfiguration {
  baseUrl: string
  namespaces: {
    brands: string
    exports: string
    photos: string
    templates: string
  }
}

export const storageConfig: Readonly<StorageConfiguration> = Object.freeze({
  baseUrl: env.storageUrl,
  namespaces: {
    brands: 'brands',
    exports: 'exports',
    photos: 'photos',
    templates: 'templates',
  },
})
