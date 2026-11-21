import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { CLIENT_TIMING_LOG_TAGS, isClientTimingBody, parseClientTiming } from '../client/api/_lib/clientTiming.ts'
import { UploadApiError, type ApiRequest } from '../client/api/_lib/http.ts'
import { enforceRateLimit, resetRateLimitsForTests } from '../client/api/_lib/rateLimit.ts'
import { deviceClass, frameSaveEvent, networkClass, parseMeasureParam, sizeBand, uploadBatchEvent, uploadFileEvent } from '../client/src/features/metrics/clientTiming.ts'

const runId = '0f3c2a1e-5b6d-4c7e-8f90-123456789abc'
const env = { device: 'ios', network: 'unknown', measure: 'wifi' }
const timing = { finalizationMs: 0, hashMs: 310, initializationMs: 120, transferMs: 2400, verificationMs: 780, totalMs: 3610, transport: 'standard' as const, tusFallback: false, transferRetries: 1 }

test('builders emit only allow-listed fields and round-trip through the server schema', () => {
  const file = uploadFileEvent(runId, timing, { size: 4 * 1024 * 1024, type: 'image/png', name: '0901234567-khung.png' })
  assert.deepEqual(parseClientTiming({ ...file, ...env }), { event: 'upload-file', runId, ...env, hashMs: 310, initializationMs: 120, transferMs: 2400, verificationMs: 780, totalMs: 3610, transport: 'standard', tusFallback: false, sizeBand: '3-6MB', mime: 'png', bytes: 4 * 1024 * 1024, transferRetries: 1 })
  assert.ok(!JSON.stringify(file).includes('0901234567'), 'filename must never be sent')

  const batch = uploadBatchEvent(runId, { fileCount: 9, okCount: 8, failedCount: 1, totalMs: 35_123.4, totalBytes: 9 * 4 * 1024 * 1024, attempt: 2 })
  assert.equal(batch.outcome, 'failed')
  assert.equal(parseClientTiming({ ...batch, ...env }).totalMs, 35_123)
  assert.equal(parseClientTiming({ ...batch, ...env }).attempt, 2)
  const abandoned = uploadBatchEvent(runId, { fileCount: 9, okCount: 4, failedCount: 0, totalMs: 60_000, totalBytes: 1, attempt: 1, abandoned: true })
  assert.equal(parseClientTiming({ ...abandoned, ...env }).outcome, 'abandoned')

  // A caller passing the whole save result (with filename) must not leak it.
  const saved = { filename: 'caspace-20261121-101010.png', bytes: 3_900_000, width: 1500, height: 3500, delivery: 'shared' as const, renderMs: 2100.6, deliveryMs: 5000, format: 'png' as const }
  const frame = frameSaveEvent(runId, saved)
  assert.ok(!('filename' in frame))
  assert.equal(parseClientTiming({ ...frame, ...env }).renderMs, 2101)
})

test('server schema rejects unknown fields, PII-shaped keys and out-of-range values', () => {
  const valid = { ...uploadBatchEvent(runId, { fileCount: 3, okCount: 3, failedCount: 0, totalMs: 9000, totalBytes: 1000, attempt: 1 }), ...env }
  for (const extra of [{ phone: '0901234567' }, { filename: 'a.png' }, { objectPath: 'x/y.png' }, { userAgent: 'Mozilla' }]) {
    assert.throws(() => parseClientTiming({ ...valid, ...extra }), (error: unknown) => error instanceof UploadApiError && error.status === 400)
  }
  assert.throws(() => parseClientTiming({ ...valid, device: 'iPhone 15' }), UploadApiError)
  assert.throws(() => parseClientTiming({ ...valid, measure: 'lab' }), UploadApiError)
  assert.throws(() => parseClientTiming({ ...valid, totalMs: -1 }), UploadApiError)
  assert.equal(parseClientTiming({ ...valid, totalMs: 45 * 60_000 }).totalMs, 30 * 60_000, 'slow batches are clamped, not dropped')
  assert.throws(() => parseClientTiming({ ...valid, totalMs: '9000' }), UploadApiError)
  assert.throws(() => parseClientTiming({ ...valid, okCount: 3, failedCount: 1 }), UploadApiError)
  assert.throws(() => parseClientTiming({ ...valid, event: 'other' }), UploadApiError)
  assert.equal(parseClientTiming({ ...valid, measure: null }).measure, null)
  assert.equal(isClientTimingBody({ code: 'X', stage: 'init' }), false)
})

test('coarse environment helpers never expose raw values', () => {
  assert.equal(sizeBand(500_000), '<1MB')
  assert.equal(sizeBand(7 * 1024 * 1024), '6-12MB')
  assert.equal(sizeBand(20 * 1024 * 1024), '>12MB')
  assert.equal(deviceClass('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)'), 'ios')
  assert.equal(deviceClass('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5), 'ios')
  assert.equal(deviceClass('Mozilla/5.0 (Linux; Android 14; SM-A546E)'), 'android')
  assert.equal(deviceClass('Mozilla/5.0 (Windows NT 10.0)'), 'other')
  assert.equal(networkClass(undefined), 'unknown')
  assert.equal(networkClass({ type: 'wifi', effectiveType: '4g' }), 'wifi')
  assert.equal(networkClass({ effectiveType: '3g' }), '3g')
  assert.equal(parseMeasureParam('4g'), '4g')
  assert.equal(parseMeasureParam('off'), 'off')
  assert.equal(parseMeasureParam('<script>'), null)
})

test('timing telemetry has its own rate-limit counter and does not consume the shared IP budget', () => {
  resetRateLimitsForTests()
  const request = { headers: { 'x-forwarded-for': '203.0.113.9' } } as unknown as ApiRequest
  for (let index = 0; index < 50; index += 1) enforceRateLimit(request, { limit: 600, windowMs: 60_000, scope: 'client-timing' })
  assert.doesNotThrow(() => enforceRateLimit(request, { limit: 1, windowMs: 60_000 }))
  assert.throws(() => enforceRateLimit(request, { limit: 1, windowMs: 60_000 }), UploadApiError)
})

test('diagnostics endpoint logs timing only through the allow-listed parser and keeps session auth', () => {
  const endpoint = readFileSync(new URL('../client/api/photo-uploads/diagnostics.ts', import.meta.url), 'utf8')
  assert.match(endpoint, /const timing = parseClientTiming\(body\)/)
  assert.match(endpoint, /console\.info\(CLIENT_TIMING_LOG_TAGS\[timing\.event\], timing\)/)
  assert.match(endpoint, /scope: 'client-timing'/)
  assert.ok(endpoint.indexOf('verifyUploadSessionToken') < endpoint.indexOf('parseClientTiming(body)'))
  assert.deepEqual(Object.values(CLIENT_TIMING_LOG_TAGS), ['[photo-upload:client-timing]', '[photo-upload:client-batch]', '[editor:save-timing]'])
})
