import assert from 'node:assert/strict'
import test from 'node:test'
import { prefetchAdjacentTemplateDetails } from '../client/src/features/templates/templateDetailLookahead'
import { RemoteExportAssetCache } from '../client/src/features/orders/services/renderComposition'

const summaries = [{ id: 'frame-1' }, { id: 'frame-2' }, { id: 'frame-3' }]

test('next frame detail and assets are prefetched in the background without changing frame order', async () => {
  const originalOrder = summaries.map(({ id }) => id)
  const loaded: string[] = []
  const assets: string[] = []
  const work = prefetchAdjacentTemplateDetails(
    summaries,
    'frame-1',
    async (id) => { loaded.push(id); return { id } },
    async ({ id }) => { assets.push(id) },
  )

  assert.deepEqual(loaded, ['frame-2'])
  assert.deepEqual(originalOrder, summaries.map(({ id }) => id))
  await work
  assert.deepEqual(assets, ['frame-2'])
})

test('selecting a prefetched frame reuses its detail without another request', async () => {
  const details = new Map<string, { id: string }>()
  let requests = 0
  const ensure = async (id: string) => {
    const cached = details.get(id)
    if (cached) return cached
    requests += 1
    const detail = { id }
    details.set(id, detail)
    return detail
  }

  await prefetchAdjacentTemplateDetails(summaries, 'frame-1', ensure)
  assert.deepEqual(await ensure('frame-2'), { id: 'frame-2' })
  assert.equal(requests, 1)
})

test('lookahead failures do not reject or alter the current frame', async () => {
  const currentFrame = 'frame-2'
  const result = await prefetchAdjacentTemplateDetails(summaries, currentFrame, async () => { throw new Error('offline') })
  assert.deepEqual(result, {})
  assert.equal(currentFrame, 'frame-2')
})

test('lookahead loads only adjacent details and export assets only for next', async () => {
  const details: string[] = []
  const assets: string[] = []
  await prefetchAdjacentTemplateDetails(
    summaries,
    'frame-2',
    async (id) => { details.push(id); return { id } },
    async ({ id }) => { assets.push(id) },
  )
  assert.deepEqual(new Set(details), new Set(['frame-1', 'frame-3']))
  assert.deepEqual(assets, ['frame-3'])
})

test('clearing the existing remote export cache releases entries for a later fresh request', async () => {
  const originalFetch = globalThis.fetch
  let requests = 0
  globalThis.fetch = (async () => { requests += 1; return new Response(new Blob(['asset']), { status: 200 }) }) as typeof fetch
  const cache = new RemoteExportAssetCache()
  try {
    await cache.load('https://assets.example/frame.png', 'template-background')
    await cache.load('https://assets.example/frame.png', 'template-background')
    assert.equal(requests, 1)
    cache.clear()
    await cache.load('https://assets.example/frame.png', 'template-background')
    assert.equal(requests, 2)
  } finally { cache.clear(); globalThis.fetch = originalFetch }
})
