import assert from 'node:assert/strict'
import test from 'node:test'
import { isTransientOrderFailure, withTransientOrderRetry } from '../client/src/features/orders/services/transientRetry'

test('transient upload failure recovers with bounded retries', async () => {
  let attempts = 0
  const waits: number[] = []
  const result = await withTransientOrderRetry(async () => {
    attempts += 1
    if (attempts === 1) throw Object.assign(new Error('service unavailable'), { status: 503 })
    return 'uploaded'
  }, { delays: [1, 2], wait: async (milliseconds) => { waits.push(milliseconds) } })
  assert.equal(result, 'uploaded')
  assert.equal(attempts, 2)
  assert.equal(waits.length, 1)
})

test('permanent upload failures are not retried', async () => {
  let attempts = 0
  await assert.rejects(withTransientOrderRetry(async () => {
    attempts += 1
    throw Object.assign(new Error('not found'), { status: 404 })
  }, { wait: async () => undefined }), /not found/)
  assert.equal(attempts, 1)
})

test('network timeouts are transient while authentication errors are permanent', () => {
  assert.equal(isTransientOrderFailure(new Error('Operation timed out')), true)
  assert.equal(isTransientOrderFailure(Object.assign(new Error('unauthorized'), { statusCode: 401 })), false)
})
