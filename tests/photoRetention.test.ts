import assert from 'node:assert/strict'
import test from 'node:test'
import handler, { isAuthorizedCron } from '../client/api/cron/cleanup-photo-uploads.ts'
import { listExpiredPhotoObjects, removePhotoObjects } from '../client/api/_lib/photoRetention.ts'

const now = Date.parse('2026-11-21T00:00:00Z')
const old = '2026-11-01T00:00:00Z'
const fresh = '2026-11-20T00:00:00Z'

function fakeStorage(folders: number) {
  const removed: string[][] = []
  const tree: Record<string, Array<{ id: string | null; name: string; created_at: string | null }>> = {
    '': Array.from({ length: folders }, (_, index) => ({ id: null, name: `09${String(index).padStart(8, '0')}`, created_at: null })),
  }
  tree['0900000000'] = [{ id: 'a', name: 'old.png', created_at: old }, { id: 'b', name: 'new.png', created_at: fresh }, { id: null, name: '_thumbs', created_at: null }]
  tree['0900000000/_thumbs'] = [{ id: 'c', name: 'old-thumb.jpg', created_at: old }]
  tree['0900001500'] = [{ id: 'd', name: 'late-folder.png', created_at: old }]
  const bucket = {
    list: async (prefix: string, options: { limit: number; offset: number }) => ({ error: null, data: (tree[prefix] ?? []).slice(options.offset, options.offset + options.limit) }),
    remove: async (paths: string[]) => { removed.push(paths); return { error: null, data: [] } },
  }
  return { client: { storage: { from: () => bucket } } as never, removed }
}

test('retention paginates past 1,000 customer folders and includes _thumbs', async () => {
  const { client } = fakeStorage(1_600)
  const result = await listExpiredPhotoObjects(client, now - 7 * 86_400_000)
  assert.equal(result.folders, 1_600)
  assert.deepEqual(result.expired.sort(), ['0900000000/_thumbs/old-thumb.jpg', '0900000000/old.png', '0900001500/late-folder.png'])
})

test('removal is batched by 100', async () => {
  const { client, removed } = fakeStorage(1)
  assert.equal(await removePhotoObjects(client, Array.from({ length: 250 }, (_, index) => `x/${index}.png`)), 250)
  assert.deepEqual(removed.map((batch) => batch.length), [100, 100, 50])
})

test('cron requires the exact CRON_SECRET bearer token', () => {
  assert.equal(isAuthorizedCron('Bearer s3cret', 's3cret'), true)
  assert.equal(isAuthorizedCron('Bearer wrong!', 's3cret'), false)
  assert.equal(isAuthorizedCron(undefined, 's3cret'), false)
  assert.equal(isAuthorizedCron('Bearer ', undefined), false)
})

test('cron rejects unauthenticated calls before touching Storage', async () => {
  const previous = process.env.CRON_SECRET
  process.env.CRON_SECRET = 'test-secret'
  let status = 0
  const response = { setHeader: () => {}, status: (code: number) => { status = code; return { json: () => {} } } }
  await handler({ headers: {} } as never, response as never)
  assert.equal(status, 401)
  process.env.CRON_SECRET = previous
})
