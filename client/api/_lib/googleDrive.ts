import { UploadApiError } from './http.js'
import type { CompletionMetadata, UploadMetadata } from './uploadValidation.js'

const driveBaseUrl = 'https://www.googleapis.com/drive/v3'
const driveUploadBaseUrl = 'https://www.googleapis.com/upload/drive/v3'
const folderMimeType = 'application/vnd.google-apps.folder'
const pendingFolders = new Map<string, Promise<string>>()

export interface GoogleDriveEnvironment {
  clientId: string
  clientSecret: string
  parentFolderId: string
  refreshToken: string
}

export interface DriveFile {
  appProperties?: Record<string, string>
  createdTime?: string
  id: string
  mimeType?: string
  name?: string
  parents?: string[]
  sha256Checksum?: string
  size?: string
  trashed?: boolean
}

function required(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new UploadApiError(503, 'Tính năng gửi ảnh đang chờ kết nối Google Drive.')
  return value
}

export function loadGoogleDriveEnvironment(): GoogleDriveEnvironment {
  return {
    clientId: required('GOOGLE_CLIENT_ID'),
    clientSecret: required('GOOGLE_CLIENT_SECRET'),
    refreshToken: required('GOOGLE_REFRESH_TOKEN'),
    parentFolderId: required('GOOGLE_DRIVE_PARENT_FOLDER_ID'),
  }
}

let cachedToken: { expiresAt: number; value: string } | null = null

export async function getGoogleAccessToken(environment: GoogleDriveEnvironment, fetchImpl: typeof fetch = fetch) {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value
  const response = await fetchImpl('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: environment.clientId, client_secret: environment.clientSecret, refresh_token: environment.refreshToken, grant_type: 'refresh_token' }),
  })
  const body = await response.json() as { access_token?: string; expires_in?: number }
  if (!response.ok || !body.access_token) throw new UploadApiError(502, 'Không thể kết nối Google Drive. Vui lòng báo nhân viên Cá Space.')
  cachedToken = { value: body.access_token, expiresAt: Date.now() + Math.max(60, body.expires_in ?? 3_600) * 1_000 }
  return cachedToken.value
}

function escapeQuery(value: string) { return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'") }

function splitFilename(filename: string) {
  const dot = filename.lastIndexOf('.')
  return dot > 0 ? { base: filename.slice(0, dot), extension: filename.slice(dot) } : { base: filename, extension: '' }
}

export class GoogleDriveUploadService {
  constructor(private readonly accessToken: string, private readonly parentFolderId: string, private readonly fetchImpl: typeof fetch = fetch) {}

  private async request(url: string, init?: RequestInit) {
    const headers = new Headers(init?.headers)
    headers.set('Authorization', `Bearer ${this.accessToken}`)
    const response = await this.fetchImpl(url, { ...init, headers })
    if (!response.ok) throw new UploadApiError(502, 'Google Drive chưa thể xử lý yêu cầu. Vui lòng thử lại.')
    return response
  }

  private async list(query: string) {
    const params = new URLSearchParams({ q: query, fields: 'files(id,name,mimeType,parents,size,sha256Checksum,trashed,createdTime,appProperties)', orderBy: 'createdTime,name', pageSize: '100', spaces: 'drive' })
    const response = await this.request(`${driveBaseUrl}/files?${params}`)
    return ((await response.json()) as { files?: DriveFile[] }).files ?? []
  }

  async findOrCreateCustomerFolder(phone: string) {
    const key = `${this.parentFolderId}:${phone}`
    const pending = pendingFolders.get(key)
    if (pending) return pending
    const operation = this.findOrCreateCustomerFolderUnlocked(phone)
    pendingFolders.set(key, operation)
    try { return await operation } finally { if (pendingFolders.get(key) === operation) pendingFolders.delete(key) }
  }

  private async findOrCreateCustomerFolderUnlocked(phone: string) {
    const query = `'${escapeQuery(this.parentFolderId)}' in parents and name='${escapeQuery(phone)}' and mimeType='${folderMimeType}' and trashed=false`
    const existing = await this.list(query)
    if (existing[0]) return existing[0].id
    const response = await this.request(`${driveBaseUrl}/files?fields=id`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: phone, mimeType: folderMimeType, parents: [this.parentFolderId], appProperties: { caspaceCustomerFolder: 'true' } }),
    })
    const created = await response.json() as { id?: string }
    if (!created.id) throw new UploadApiError(502, 'Không thể tạo thư mục nhận ảnh.')
    const afterCreate = await this.list(query)
    return afterCreate[0]?.id ?? created.id
  }

  async findCompletedRequest(requestId: string) {
    const query = `appProperties has { key='uploadRequestId' and value='${escapeQuery(requestId)}' } and trashed=false`
    return (await this.list(query))[0] ?? null
  }

  async uniqueFilename(folderId: string, filename: string) {
    const query = `'${escapeQuery(folderId)}' in parents and trashed=false`
    const names = new Set((await this.list(query)).map((file) => file.name))
    if (!names.has(filename)) return filename
    const { base, extension } = splitFilename(filename)
    let index = 2
    while (names.has(`${base} (${index})${extension}`)) index += 1
    return `${base} (${index})${extension}`
  }

  async createResumableUpload(folderId: string, metadata: UploadMetadata) {
    const existing = await this.findCompletedRequest(metadata.requestId)
    if (existing?.parents?.includes(folderId) && existing.size === String(metadata.size) && existing.appProperties?.sha256 === metadata.sha256) return { alreadyUploaded: true as const, fileId: existing.id, folderId }
    const name = await this.uniqueFilename(folderId, metadata.filename)
    const params = new URLSearchParams({ uploadType: 'resumable', fields: 'id,name,size,mimeType,parents,appProperties' })
    const response = await this.request(`${driveUploadBaseUrl}/files?${params}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Length': String(metadata.size), 'X-Upload-Content-Type': metadata.mimeType },
      body: JSON.stringify({ name, mimeType: metadata.mimeType, parents: [folderId], appProperties: { sha256: metadata.sha256, uploadRequestId: metadata.requestId } }),
    })
    const uploadUrl = response.headers.get('location')
    const uploadHost = uploadUrl ? new URL(uploadUrl).hostname : ''
    if (!uploadUrl || (uploadHost !== 'www.googleapis.com' && !uploadHost.endsWith('.googleapis.com'))) throw new UploadApiError(502, 'Google Drive không trả về phiên tải ảnh an toàn.')
    return { alreadyUploaded: false as const, folderId, uploadUrl }
  }

  async verifyCompletedUpload(metadata: CompletionMetadata) {
    const fields = 'id,name,size,sha256Checksum,mimeType,parents,trashed,appProperties'
    const response = await this.request(`${driveBaseUrl}/files/${encodeURIComponent(metadata.fileId)}?fields=${encodeURIComponent(fields)}`)
    const file = await response.json() as DriveFile
    if (file.trashed || file.size !== String(metadata.size) || file.sha256Checksum !== metadata.sha256 || file.mimeType !== metadata.mimeType || !file.parents?.includes(metadata.folderId) || file.appProperties?.sha256 !== metadata.sha256 || file.appProperties?.uploadRequestId !== metadata.requestId) throw new UploadApiError(409, 'Google Drive chưa xác nhận đầy đủ ảnh. Vui lòng thử lại.')
    const folderResponse = await this.request(`${driveBaseUrl}/files/${encodeURIComponent(metadata.folderId)}?fields=${encodeURIComponent('id,mimeType,parents,trashed')}`)
    const folder = await folderResponse.json() as DriveFile
    if (folder.trashed || folder.mimeType !== folderMimeType || !folder.parents?.includes(this.parentFolderId)) throw new UploadApiError(409, 'Thư mục nhận ảnh không hợp lệ.')
    return file
  }
}

export function resetGoogleTokenForTests() { cachedToken = null }
