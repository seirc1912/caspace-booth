import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL?.trim() || 'https://jmxhlueibhpltxrwqdpf.supabase.co'
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() || 'sb_publishable_iQy5i_H_MAEGASo-sP-fWQ_7RYXa6rY'

export const staffSupabase = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'caspace-staff-auth' } })

async function staffFetch(path: string, token: string, init?: RequestInit) {
  const response = await fetch(path, { ...init, headers: { ...init?.headers, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } })
  const body = await response.json().catch(() => ({})) as { error?: string }
  if (response.status === 401) await staffSupabase.auth.signOut()
  if (!response.ok) throw new Error(body.error ?? 'Không thể tải dữ liệu.')
  return body
}

export interface StaffPhoto { name: string; path: string; previewUrl: string | null; size: number; uploadedAt: string | null }

export async function listStaffPhotos(token: string, phone: string, offset = 0) {
  return staffFetch(`/api/staff/photos?phone=${encodeURIComponent(phone)}&offset=${offset}`, token) as Promise<{ items: StaffPhoto[]; hasMore: boolean }>
}

export async function downloadStaffPhoto(token: string, phone: string, path: string) {
  const result = await staffFetch('/api/staff/photos/download', token, { method: 'POST', body: JSON.stringify({ phone, path }) }) as { url: string }
  window.location.assign(result.url)
}

export async function downloadStaffZip(token: string, phone: string) {
  const response = await fetch(`/api/staff/photos/zip?phone=${encodeURIComponent(phone)}`, { headers: { Authorization: `Bearer ${token}` } })
  if (!response.ok) { const body = await response.json().catch(() => ({})) as { error?: string }; throw new Error(body.error ?? 'Không thể tải ZIP.') }
  const url = URL.createObjectURL(await response.blob())
  const link = document.createElement('a'); link.href = url; link.download = `caspace-${phone}.zip`; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
