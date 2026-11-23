import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { boothAccessStatus, reopenBoothAccess } from '../client/api/_lib/boothPhotos.ts'

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
