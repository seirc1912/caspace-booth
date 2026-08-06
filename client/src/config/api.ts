import { env } from './env'

export interface ApiConfiguration {
  baseUrl: string
  endpoints: {
    brands: string
    exports: string
    photos: string
    sessions: string
    templates: string
    users: string
  }
}

export const apiConfig: Readonly<ApiConfiguration> = Object.freeze({
  baseUrl: env.apiUrl,
  endpoints: {
    brands: '/api/brands',
    exports: '/api/exports',
    photos: '/api/photos',
    sessions: '/api/sessions',
    templates: '/api/templates',
    users: '/api/users',
  },
})
