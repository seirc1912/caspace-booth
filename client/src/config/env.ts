export type AppRole = 'customer' | 'admin'

export interface AppEnvironment {
  appName: string
  appRole: AppRole
  apiUrl: string
  appUrl: string
  adminUrl: string
  storageUrl: string
}

const normalizeOrigin = (value: string | undefined, fallback: string) =>
  (value?.trim() || fallback).replace(/\/$/, '')

export const env: Readonly<AppEnvironment> = Object.freeze({
  appName: import.meta.env.VITE_APP_NAME?.trim() || 'SelfBooth',
  appRole: import.meta.env.VITE_APP_ROLE === 'admin' ? 'admin' : 'customer',
  apiUrl: normalizeOrigin(import.meta.env.VITE_API_URL, import.meta.env.DEV ? '' : 'https://api.caspace.vn'),
  appUrl: normalizeOrigin(import.meta.env.VITE_APP_URL, 'https://booth.caspace.vn'),
  adminUrl: normalizeOrigin(import.meta.env.VITE_ADMIN_URL, 'https://admin.caspace.vn'),
  storageUrl: normalizeOrigin(import.meta.env.VITE_STORAGE_URL, ''),
})
