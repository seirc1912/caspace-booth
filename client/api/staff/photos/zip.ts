import { enforceSameOrigin, header, sendApiError, type ApiRequest, type ApiResponse, UploadApiError } from '../../_lib/http.js'
import { enforceRateLimit } from '../../_lib/rateLimit.js'
import { requireStaff } from '../../_lib/staffAuth.js'
import { listCustomerPhotos, requireCustomerPhone } from '../../_lib/staffPhotos.js'
import { customerPhotoBucket } from '../../_lib/supabaseStorage.js'

export const config = { maxDuration: 60 }
interface QueryRequest extends ApiRequest { query?: Record<string, string | string[] | undefined> }
interface StreamResponse extends ApiResponse { write(chunk: Uint8Array): boolean; end(chunk?: Uint8Array): void }

const crcTable = Array.from({ length: 256 }, (_, value) => { let crc = value; for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1) ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1; return crc >>> 0 })
export function updateCrc32(crc: number, bytes: Uint8Array) { let next = crc; for (const byte of bytes) next = crcTable[(next ^ byte) & 0xff]! ^ (next >>> 8); return next >>> 0 }
const u16 = (value: number) => { const buffer = Buffer.alloc(2); buffer.writeUInt16LE(value); return buffer }
const u32 = (value: number) => { const buffer = Buffer.alloc(4); buffer.writeUInt32LE(value >>> 0); return buffer }

function localHeader(name: Buffer) { return Buffer.concat([u32(0x04034b50), u16(20), u16(0x808), u16(0), u16(0), u16(0), u32(0), u32(0), u32(0), u16(name.length), u16(0), name]) }
function descriptor(crc: number, size: number) { return Buffer.concat([u32(0x08074b50), u32(crc), u32(size), u32(size)]) }
function centralHeader(name: Buffer, crc: number, size: number, offset: number) { return Buffer.concat([u32(0x02014b50), u16(20), u16(20), u16(0x808), u16(0), u16(0), u16(0), u32(crc), u32(size), u32(size), u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), name]) }

export default async function handler(request: QueryRequest, response: StreamResponse) {
  if (request.method !== 'GET') { response.status(405).json({ error: 'Phương thức không được hỗ trợ.' }); return }
  try {
    enforceSameOrigin(request); enforceRateLimit(request, { limit: 10, windowMs: 10 * 60_000 })
    const { client, environment } = await requireStaff(request)
    const phone = requireCustomerPhone(request.query?.phone)
    const listed = await listCustomerPhotos(client, phone, 0, 1_000)
    if (!listed.items.length) throw new UploadApiError(404, 'Không có ảnh để tải.')
    response.setHeader('Cache-Control', 'no-store, private')
    response.setHeader('Content-Type', 'application/zip')
    response.setHeader('Content-Disposition', `attachment; filename="caspace-${phone}.zip"`)
    const central: Buffer[] = []
    let offset = 0
    for (const item of listed.items) {
      const name = Buffer.from(item.name.replace(/[\\/]/g, '_'), 'utf8')
      const start = localHeader(name); response.write(start); const entryOffset = offset; offset += start.length
      const url = `${environment.url}/storage/v1/object/authenticated/${customerPhotoBucket}/${item.path.split('/').map(encodeURIComponent).join('/')}`
      const object = await fetch(url, { headers: { apikey: environment.serviceRoleKey, Authorization: `Bearer ${environment.serviceRoleKey}` } })
      if (!object.ok || !object.body) throw new UploadApiError(502, 'Không thể tải một file gốc.')
      const reader = object.body.getReader(); let crc = 0xffffffff; let size = 0
      while (true) { const chunk = await reader.read(); if (chunk.done) break; crc = updateCrc32(crc, chunk.value); size += chunk.value.byteLength; response.write(chunk.value); offset += chunk.value.byteLength }
      crc = (crc ^ 0xffffffff) >>> 0; const tail = descriptor(crc, size); response.write(tail); offset += tail.length; central.push(centralHeader(name, crc, size, entryOffset))
    }
    const centralOffset = offset; for (const entry of central) { response.write(entry); offset += entry.length }
    response.end(Buffer.concat([u32(0x06054b50), u16(0), u16(0), u16(central.length), u16(central.length), u32(offset - centralOffset), u32(centralOffset), u16(0)]))
  } catch (reason) {
    if (!header(request, 'authorization')) { sendApiError(response, reason); return }
    sendApiError(response, reason)
  }
}
