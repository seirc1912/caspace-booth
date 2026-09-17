import assert from 'node:assert/strict'
import test from 'node:test'
import { OrderPipelineError, runOrderPipeline } from '../client/src/features/orders/services/orderPipeline'

const frames = (count: number) => Array.from({ length: count }, (_, index) => ({
  index,
  template: { id: `template-${index + 1}`, name: `Frame ${index + 1}`, canvas: { width: 1800, height: 1800 } },
  slots: [{ photo: `high-resolution-${index + 1}`, filter: index % 2 ? 'grayscale' : 'none' }],
}))

test('13-frame pipeline preflights before rendering and holds only one rendered frame', async () => {
  const events: string[] = []
  let liveRendered = 0
  let peakRendered = 0
  const result = await runOrderPipeline({
    attemptId: 'attempt-13', frames: frames(13),
    preflight: async () => { events.push('preflight') },
    render: async (frame) => { liveRendered += 1; peakRendered = Math.max(peakRendered, liveRendered); events.push(`render-${frame.index}`); return new Blob([`png-${frame.index}`]) },
    upload: async (frame) => { events.push(`upload-${frame.index}`) },
    releaseFrame: (frame) => { liveRendered -= 1; events.push(`release-${frame.index}`) },
    submit: async () => { events.push('submit'); return 'confirmed' },
  })
  assert.equal(result, 'confirmed')
  assert.equal(peakRendered, 1)
  assert.equal(events[0], 'preflight')
  assert.equal(events.at(-1), 'submit')
  for (let index = 0; index < 13; index += 1) assert.deepEqual(events.slice(1 + index * 3, 4 + index * 3), [`render-${index}`, `upload-${index}`, `release-${index}`])
})

test('preflight failure prevents frame 1 rendering', async () => {
  let renders = 0
  await assert.rejects(runOrderPipeline({
    frames: frames(13), preflight: async () => { throw new Error('background unavailable') },
    render: async () => { renders += 1 }, upload: async () => undefined, releaseFrame: () => undefined, submit: async () => undefined,
  }), (reason: unknown) => reason instanceof OrderPipelineError && reason.diagnostics.stage === 'preflight' && reason.diagnostics.completedCount === 0)
  assert.equal(renders, 0)
})

test('frame 6 upload failure reports frame, stage, and five completed frames', async () => {
  const released: number[] = []
  await assert.rejects(runOrderPipeline({
    attemptId: 'attempt-failure', frames: frames(13), preflight: async () => undefined,
    render: async (frame) => new Blob([`png-${frame.index}`]),
    upload: async (frame) => { if (frame.index === 5) throw new Error('simulated transient upload exhaustion') },
    releaseFrame: (frame) => { released.push(frame.index) }, submit: async () => undefined,
  }), (reason: unknown) => reason instanceof OrderPipelineError
    && reason.diagnostics.stage === 'upload'
    && reason.diagnostics.frame?.template.id === 'template-6'
    && reason.diagnostics.completedCount === 5)
  assert.deepEqual(released, [0, 1, 2, 3, 4, 5])
})

test('failure retry reuses completed work and submits only once', async () => {
  const uploaded = new Set<number>()
  let submitCalls = 0
  const execute = (failAt: number | null) => runOrderPipeline({
    frames: frames(13).filter((frame) => !uploaded.has(frame.index)), preflight: async () => undefined,
    render: async (frame) => new Blob([`png-${frame.index}`]),
    upload: async (frame) => { if (frame.index === failAt) throw new Error('network'); uploaded.add(frame.index) },
    releaseFrame: () => undefined, submit: async () => { submitCalls += 1; return 'confirmed' },
  })
  await assert.rejects(execute(6))
  assert.deepEqual([...uploaded], [0, 1, 2, 3, 4, 5])
  assert.equal(await execute(null), 'confirmed')
  assert.equal(uploaded.size, 13)
  assert.equal(submitCalls, 1)
})

for (const [name, count] of [['A one Original', 1], ['B one B&W', 1], ['C five high resolution', 5], ['D thirteen Original', 13], ['E thirteen mixed', 13], ['F thirteen large backgrounds', 13], ['G thirteen slow network', 13]] as const) {
  test(`${name} completes bounded sequential processing`, async () => {
    let completed = 0
    await runOrderPipeline({
      frames: frames(count), preflight: async () => undefined, render: async () => new Blob(['png']),
      upload: async () => { completed += 1 }, releaseFrame: () => undefined, submit: async () => 'ok',
    })
    assert.equal(completed, count)
  })
}
