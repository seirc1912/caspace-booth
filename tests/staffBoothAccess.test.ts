import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { boothAccessStatus, reopenBoothAccess } from '../client/api/_lib/boothPhotos.ts'
import { UploadApiError } from '../client/api/_lib/http.ts'

const now = Date.parse('2026-11-23T12:00:00Z')
const HOUR = 3_600_000

function client(entries: Array<{ id: string | null; name: string; created_at: string | null }>) {
  const uploads: Array<{ path: string; body: string; options: unknown }> = []
  let access: string | null = null
  const bucket = {
    list: async () => ({ data: entries, error: null }),
    download: async () => (access ? { data: new Blob([access]), error: null } : { data: null, error: { message: 'missing' } }),
    upload: async (path: string, body: Blob, options: unknown) => {
      access = await body.text()
      uploads.push({ path, body: access, options })
      if (!entries.some((entry) => entry.name === '_access.json')) entries.push({ id: 'acc', name: '_access.json', created_at: new Date(now).toISOString() })
      return { data: { path }, error: null }
    },
  }
  return { uploads, client: { storage: { from: () => bucket } } as never }
}

test('staff reopen stores the click time and gives exactly 6 more hours', async () => {
  const fake = client([{ id: '1', name: 'a.jpg', created_at: new Date(now - 30 * HOUR).toISOString() }])
  assert.deepEqual(await boothAccessStatus(fake.client, '0947860616', now), { boothPhotoCount: 1, viewableUntil: new Date(now - 24 * HOUR).toISOString(), viewable: false })
  const reopened = await reopenBoothAccess(fake.client, '0947860616', now)
  assert.equal(fake.uploads[0]!.path, '0947860616/_booth/_access.json')
  assert.deepEqual(JSON.parse(fake.uploads[0]!.body), { reopenedAt: new Date(now).toISOString() })
  assert.deepEqual(fake.uploads[0]!.options, { upsert: true, contentType: 'application/json' })
  assert.equal(reopened.viewableUntil, new Date(now + 6 * HOUR).toISOString())
  assert.equal(reopened.viewable, true)
  assert.equal(reopened.boothPhotoCount, 1, '_access.json is not counted as a photo')
})

test('reopening a phone without booth photos explains how to resend from the booth PC', async () => {
  await assert.rejects(() => reopenBoothAccess(client([]).client, '0947860616', now), /Gửi lại thư mục/)
})

test('booth access endpoint is staff-only and same-origin', () => {
  const source = readFileSync('client/api/staff/booth-access.ts', 'utf8')
  assert.match(source, /await requireStaff\(request\)/)
  assert.match(source, /enforceSameOrigin\(request\)/)
  assert.match(readFileSync('client/src/pages/StaffPhotosPage.tsx', 'utf8'), /Mở lại 6 giờ/)
})

test('staff list booth originals in shooting order with their booth thumbnails', async () => {
  const { listCustomerPhotos, requireCustomerObjectPath, parsePhotoSource } = await import('../client/api/_lib/staffPhotos.ts')
  const calls: Array<{ prefix?: string; paths?: string[] }> = []
  const bucket = {
    list: async (prefix: string, options: { sortBy: { column: string } }) => { calls.push({ prefix }); assert.equal(options.sortBy.column, 'name'); return { error: null, data: [{ id: '1', name: '0912345678-100001.jpg', created_at: 'x', metadata: { size: 3_500_000 } }, { id: '2', name: '_access.json', created_at: 'x', metadata: {} }, { id: null, name: '_thumbs', created_at: null, metadata: null }] } },
    createSignedUrls: async (paths: string[]) => { calls.push({ paths }); return { error: null, data: paths.map((path) => ({ path, signedUrl: `https://signed/${path}`, error: null })) } },
  }
  const listed = await listCustomerPhotos({ storage: { from: () => bucket } } as never, '0912345678', 0, 40, { source: 'booth' })
  assert.equal(calls[0]!.prefix, '0912345678/_booth')
  assert.deepEqual(listed.items.map((item) => [item.name, item.path, item.previewUrl]), [['0912345678-100001.jpg', '0912345678/_booth/0912345678-100001.jpg', 'https://signed/0912345678/_booth/_thumbs/0912345678-100001-thumb.jpg']])
  assert.equal(parsePhotoSource('booth'), 'booth')
  assert.equal(parsePhotoSource('anything'), 'frames')
  assert.equal(requireCustomerObjectPath('0912345678', '0912345678/_booth/a.jpg'), '0912345678/_booth/a.jpg')
  for (const bad of ['0912345678/_booth/_thumbs/a.jpg', '0912345678/_booth/../a.jpg', '0999999999/_booth/a.jpg', '0912345678/_booth/_access.json', '0912345678/_other/a.jpg']) assert.throws(() => requireCustomerObjectPath('0912345678', bad), /Đường dẫn ảnh không hợp lệ/, bad)
  const page = readFileSync('client/src/pages/StaffPhotosPage.tsx', 'utf8')
  assert.match(page, /Ảnh gốc phòng chụp/)
  assert.match(readFileSync('client/api/staff/photos/zip.ts', 'utf8'), /source === 'booth' \? '-anh-goc' : ''/)
})
