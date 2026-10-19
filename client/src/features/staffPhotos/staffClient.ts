async function staffFetch(path: string, init?: RequestInit) {
  const response = await fetch(path, { ...init, credentials: 'same-origin', headers: { ...init?.headers, 'Content-Type': 'application/json' } })
  const body = await response.json().catch(() => ({})) as { error?: string }
  if (!response.ok) throw new Error(body.error ?? 'Không thể tải dữ liệu.')
  return body
}

export interface StaffPhoto { name: string; path: string; previewUrl: string | null; size: number; uploadedAt: string | null }
export interface StaffPhotoFolder { phone: string; photoCount: number; latestUploadAt: string | null; countCapped: boolean }

export async function loginStaff(username: string, password: string) {
  await staffFetch('/api/staff/login', { method: 'POST', body: JSON.stringify({ username, password }) })
}

export async function checkStaffSession() {
  try { await staffFetch('/api/staff/session'); return true } catch { return false }
}

export async function logoutStaff() {
  await staffFetch('/api/staff/session', { method: 'DELETE' })
}

export async function listStaffPhotos(phone: string, offset = 0) {
  return staffFetch(`/api/staff/photos?phone=${encodeURIComponent(phone)}&offset=${offset}`) as Promise<{ items: StaffPhoto[]; hasMore: boolean }>
}

export async function listStaffPhotoFolders(search = '', offset = 0) {
  return staffFetch(`/api/staff/folders?search=${encodeURIComponent(search)}&offset=${offset}`) as Promise<{ items: StaffPhotoFolder[]; hasMore: boolean; nextOffset: number }>
}

export async function downloadStaffPhoto(phone: string, path: string) {
  const result = await staffFetch('/api/staff/photos/download', { method: 'POST', body: JSON.stringify({ phone, path }) }) as { url: string }
  window.location.assign(result.url)
}

export async function downloadStaffZip(phone: string) {
  const response = await fetch(`/api/staff/photos/zip?phone=${encodeURIComponent(phone)}`, { credentials: 'same-origin' })
  if (!response.ok) { const body = await response.json().catch(() => ({})) as { error?: string }; throw new Error(body.error ?? 'Không thể tải ZIP.') }
  const url = URL.createObjectURL(await response.blob())
  const link = document.createElement('a'); link.href = url; link.download = `caspace-${phone}.zip`; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
