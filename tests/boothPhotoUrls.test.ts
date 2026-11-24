import assert from 'node:assert/strict'
import test from 'node:test'
import { BOOTH_URL_REUSE_MS, stabilizeBoothPhotos, type BoothPhoto } from '../client/src/features/boothPhotos/boothPhotosClient.ts'

const photo = (id: string, token: string): BoothPhoto => ({ id, name: `${id}.jpg`, thumbUrl: `t/${id}?${token}`, previewUrl: null, originalUrl: `o/${id}?${token}`, uploadedAt: '' })

test('polling keeps the first signed links, so the large viewer and thumbnails never reload', () => {
  const first = stabilizeBoothPhotos(null, [photo('a', '1')], 0)
  const second = stabilizeBoothPhotos(first, [photo('a', '2')], 10_000)
  assert.equal(second, first, 'nothing changed: same object, no re-render')
  assert.equal(second.photos[0]!.originalUrl, 'o/a?1')
})

test('a new photo is added with its own links; known photos keep theirs', () => {
  const first = stabilizeBoothPhotos(null, [photo('a', '1')], 0)
  const second = stabilizeBoothPhotos(first, [photo('a', '2'), photo('b', '2')], 10_000)
  assert.notEqual(second, first)
  assert.equal(second.photos[0], first.photos[0])
  assert.equal(second.photos[1]!.originalUrl, 'o/b?2')
})

test('links are renewed before the 60-minute signature expires; deleted photos disappear', () => {
  const first = stabilizeBoothPhotos(null, [photo('a', '1'), photo('b', '1')], 0)
  const renewed = stabilizeBoothPhotos(first, [photo('a', '9')], BOOTH_URL_REUSE_MS)
  assert.deepEqual(renewed.photos.map((item) => item.originalUrl), ['o/a?9'])
  assert.ok(BOOTH_URL_REUSE_MS < 60 * 60_000)
})
