import assert from 'node:assert/strict'
import test from 'node:test'
import { deliverImageFile, isShareCancellation } from '../client/src/features/orders/services/saveComposition'

const image = new Blob(['rendered-image'], { type: 'image/png' })

test('supported file sharing receives the existing rendered image as a real File', async () => {
  let sharedFile: File | undefined
  let downloaded = false
  const delivery = await deliverImageFile(image, 'caspace.png', {
    navigator: {
      canShare: ({ files }) => Boolean(files?.length),
      share: async ({ files }) => { sharedFile = files?.[0] },
    },
    download: () => { downloaded = true },
  })

  assert.equal(delivery, 'shared')
  assert.equal(downloaded, false)
  assert.ok(sharedFile instanceof File)
  assert.equal(sharedFile.name, 'caspace.png')
  assert.equal(sharedFile.type, image.type)
  assert.equal(sharedFile.size, image.size)
  assert.deepEqual(await sharedFile.arrayBuffer(), await image.arrayBuffer())
})

test('cancelling the share sheet is a no-op', async () => {
  let downloaded = false
  const delivery = await deliverImageFile(image, 'caspace.png', {
    navigator: { canShare: () => true, share: async () => { throw new DOMException('Cancelled', 'AbortError') } },
    download: () => { downloaded = true },
  })

  assert.equal(delivery, 'cancelled')
  assert.equal(downloaded, false)
  assert.equal(isShareCancellation(new DOMException('Cancelled', 'AbortError')), true)
})

test('unsupported file sharing falls back to the existing download', async () => {
  let downloaded: { blob: Blob; filename: string } | undefined
  const delivery = await deliverImageFile(image, 'caspace.png', {
    navigator: { canShare: () => false, share: async () => undefined },
    download: (blob, filename) => { downloaded = { blob, filename } },
  })

  assert.equal(delivery, 'downloaded')
  assert.equal(downloaded?.blob, image)
  assert.equal(downloaded?.filename, 'caspace.png')
})

test('an unexpected share failure safely falls back to download', async () => {
  let downloads = 0
  const delivery = await deliverImageFile(image, 'caspace.png', {
    navigator: { canShare: () => true, share: async () => { throw new Error('Share failed') } },
    download: () => { downloads += 1 },
  })

  assert.equal(delivery, 'downloaded')
  assert.equal(downloads, 1)
})
