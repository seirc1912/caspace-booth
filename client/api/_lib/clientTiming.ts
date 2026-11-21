import { UploadApiError } from './http.js'

// Client-side timing events (KE-HOACH-TOI-UU-UPLOAD-ANH.md §4.4 / PR 0).
// Every field is allow-listed. Unknown fields are rejected, so a phone number,
// filename, object path, URL, token or user agent can never reach the logs.

export const CLIENT_TIMING_LOG_TAGS = {
  'upload-file': '[photo-upload:client-timing]',
  'upload-batch': '[photo-upload:client-batch]',
  'frame-save': '[editor:save-timing]',
} as const

export type ClientTimingEvent = keyof typeof CLIENT_TIMING_LOG_TAGS

const devices = new Set(['ios', 'android', 'other'])
const networks = new Set(['wifi', 'cellular', '4g', '3g', '2g', 'slow-2g', 'unknown'])
const measureLabels = new Set(['wifi', '4g', '5g', 'other'])
const transports = new Set(['existing', 'standard', 'tus'])
const sizeBands = new Set(['<1MB', '1-3MB', '3-6MB', '6-12MB', '>12MB'])
const mimes = new Set(['png', 'jpeg'])
const formats = new Set(['png', 'jpg'])
const deliveries = new Set(['shared', 'downloaded', 'cancelled'])
const outcomes = new Set(['ok', 'failed', 'abandoned'])

const MAX_MS = 30 * 60_000
const MAX_BYTES = 50 * 25 * 1024 * 1024

const commonKeys = ['kind', 'event', 'runId', 'device', 'network', 'measure'] as const
const eventKeys: Record<ClientTimingEvent, readonly string[]> = {
  'upload-file': ['hashMs', 'initializationMs', 'transferMs', 'verificationMs', 'totalMs', 'transport', 'tusFallback', 'sizeBand', 'mime', 'bytes'],
  'upload-batch': ['fileCount', 'okCount', 'failedCount', 'totalMs', 'totalBytes', 'outcome', 'attempt'],
  'frame-save': ['renderMs', 'deliveryMs', 'bytes', 'width', 'height', 'format', 'delivery'],
}

const invalid = () => new UploadApiError(400, 'Số đo thời gian không hợp lệ.')

function oneOf(value: unknown, allowed: Set<string>) {
  if (typeof value !== 'string' || !allowed.has(value)) throw invalid()
  return value
}

// Over-limit values are clamped, not rejected: the slowest real batches are
// exactly the ones the telemetry must not drop.
function integer(value: unknown, max: number) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw invalid()
  return Math.round(Math.min(value, max))
}

function boolean(value: unknown) {
  if (typeof value !== 'boolean') throw invalid()
  return value
}

export function isClientTimingBody(value: unknown) {
  return Boolean(value && typeof value === 'object' && (value as Record<string, unknown>).kind === 'timing')
}

export function parseClientTiming(value: unknown) {
  if (!isClientTimingBody(value)) throw invalid()
  const body = value as Record<string, unknown>
  const event = oneOf(body.event, new Set(Object.keys(eventKeys))) as ClientTimingEvent
  const allowed = new Set<string>([...commonKeys, ...eventKeys[event]])
  if (Object.keys(body).some((key) => !allowed.has(key))) throw invalid()
  if (typeof body.runId !== 'string' || !/^[0-9a-f-]{20,50}$/i.test(body.runId)) throw invalid()
  const common = {
    event,
    runId: body.runId,
    device: oneOf(body.device, devices),
    network: oneOf(body.network, networks),
    measure: body.measure === null || body.measure === undefined ? null : oneOf(body.measure, measureLabels),
  }
  if (event === 'upload-file') return {
    ...common,
    hashMs: integer(body.hashMs, MAX_MS),
    initializationMs: integer(body.initializationMs, MAX_MS),
    transferMs: integer(body.transferMs, MAX_MS),
    verificationMs: integer(body.verificationMs, MAX_MS),
    totalMs: integer(body.totalMs, MAX_MS),
    transport: oneOf(body.transport, transports),
    tusFallback: boolean(body.tusFallback),
    sizeBand: oneOf(body.sizeBand, sizeBands),
    mime: oneOf(body.mime, mimes),
    bytes: integer(body.bytes, 25 * 1024 * 1024),
  }
  if (event === 'upload-batch') {
    const fileCount = integer(body.fileCount, 50)
    const okCount = integer(body.okCount, 50)
    const failedCount = integer(body.failedCount, 50)
    if (okCount + failedCount > fileCount) throw invalid()
    return { ...common, fileCount, okCount, failedCount, totalMs: integer(body.totalMs, MAX_MS), totalBytes: integer(body.totalBytes, MAX_BYTES), outcome: oneOf(body.outcome, outcomes), attempt: integer(body.attempt, 50) }
  }
  return {
    ...common,
    renderMs: integer(body.renderMs, MAX_MS),
    deliveryMs: integer(body.deliveryMs, MAX_MS),
    bytes: integer(body.bytes, 100 * 1024 * 1024),
    width: integer(body.width, 20_000),
    height: integer(body.height, 20_000),
    format: oneOf(body.format, formats),
    delivery: oneOf(body.delivery, deliveries),
  }
}
