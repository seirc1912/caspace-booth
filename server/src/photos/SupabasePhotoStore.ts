import { randomUUID } from 'node:crypto'

interface SessionInput { sessionId: string; boothId: string; phoneNumber: string }
interface ImportedPhoto { id: string; sessionId: string; boothId: string; storagePath: string; sourceName: string; createdAt: string; url: string }

export class SupabasePhotoStore {
  private readonly restUrl: string
  private readonly storageUrl: string

  constructor(private readonly projectUrl: string, private readonly serviceKey: string) {
    if (!projectUrl || !serviceKey) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
    this.restUrl = `${projectUrl.replace(/\/$/, '')}/rest/v1`
    this.storageUrl = `${projectUrl.replace(/\/$/, '')}/storage/v1`
  }

  private headers(extra: Record<string, string> = {}) {
    return { apikey: this.serviceKey, Authorization: `Bearer ${this.serviceKey}`, ...extra }
  }

  private async assertOk(response: Response) {
    if (response.ok) return response
    throw new Error(`Supabase ${response.status}: ${await response.text()}`)
  }

  async createSession(input: SessionInput) {
    await this.assertOk(await fetch(`${this.restUrl}/customer_sessions?booth_id=eq.${encodeURIComponent(input.boothId)}&status=eq.active`, {
      method: 'PATCH', headers: this.headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ status: 'completed', completed_at: new Date().toISOString() }),
    }))
    await this.assertOk(await fetch(`${this.restUrl}/customer_sessions`, {
      method: 'POST', headers: this.headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ session_id: input.sessionId, booth_id: input.boothId, phone_number: input.phoneNumber, status: 'active' }),
    }))
  }

  async boothExists(boothId: string) {
    const response = await this.assertOk(await fetch(`${this.restUrl}/rooms?id=eq.${encodeURIComponent(boothId)}&enabled=eq.true&select=id&limit=1`, { headers: this.headers() }))
    return ((await response.json()) as unknown[]).length === 1
  }

  async activeSession(boothId: string) {
    const response = await this.assertOk(await fetch(`${this.restUrl}/customer_sessions?booth_id=eq.${encodeURIComponent(boothId)}&status=eq.active&select=session_id&order=created_at.desc&limit=1`, { headers: this.headers() }))
    return ((await response.json()) as Array<{ session_id: string }>)[0]?.session_id ?? null
  }

  async sessionPhotos(sessionId: string) {
    const response = await this.assertOk(await fetch(`${this.restUrl}/session_photos?session_id=eq.${encodeURIComponent(sessionId)}&select=id,session_id,booth_id,storage_path,source_name,created_at&order=created_at.desc`, { headers: this.headers() }))
    return ((await response.json()) as Array<{ id: string; session_id: string; booth_id: string; storage_path: string; source_name: string; created_at: string }>).map((row) => ({
      id: row.id, sessionId: row.session_id, boothId: row.booth_id, storagePath: row.storage_path, sourceName: row.source_name,
      createdAt: row.created_at, url: `${this.storageUrl}/object/public/session-photos/${row.storage_path}`,
    }))
  }

  async importPhoto(input: { boothId: string; sessionId: string; sourceName: string; contentHash: string; bytes: Buffer }) : Promise<ImportedPhoto | null> {
    const duplicate = await this.assertOk(await fetch(`${this.restUrl}/session_photos?session_id=eq.${input.sessionId}&content_hash=eq.${input.contentHash}&select=id&limit=1`, { headers: this.headers() }))
    if (((await duplicate.json()) as unknown[]).length) return null
    const safeName = input.sourceName.replace(/[^a-zA-Z0-9._-]/g, '_')
    const storagePath = `${input.boothId}/${input.sessionId}/${randomUUID()}-${safeName}`
    await this.assertOk(await fetch(`${this.storageUrl}/object/session-photos/${storagePath}`, {
      method: 'POST', headers: this.headers({ 'Content-Type': 'image/jpeg', 'x-upsert': 'false' }),
      body: input.bytes.buffer.slice(input.bytes.byteOffset, input.bytes.byteOffset + input.bytes.byteLength) as ArrayBuffer,
    }))
    try {
      const response = await this.assertOk(await fetch(`${this.restUrl}/session_photos?select=id,session_id,booth_id,storage_path,source_name,created_at`, {
        method: 'POST', headers: this.headers({ 'Content-Type': 'application/json', Prefer: 'return=representation' }),
        body: JSON.stringify({ session_id: input.sessionId, booth_id: input.boothId, storage_path: storagePath, source_name: input.sourceName, content_hash: input.contentHash }),
      }))
      const row = ((await response.json()) as Array<{ id: string; session_id: string; booth_id: string; storage_path: string; source_name: string; created_at: string }>)[0]!
      return { id: row.id, sessionId: row.session_id, boothId: row.booth_id, storagePath: row.storage_path, sourceName: row.source_name, createdAt: row.created_at, url: `${this.storageUrl}/object/public/session-photos/${storagePath}` }
    } catch (error) {
      await fetch(`${this.storageUrl}/object/session-photos/${storagePath}`, { method: 'DELETE', headers: this.headers() })
      throw error
    }
  }
}
