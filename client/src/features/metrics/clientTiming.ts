// Client timing measurements (docs/KE-HOACH-TOI-UU-UPLOAD-ANH.md §4.4, PR 0).
//
// - Real customers: anonymous durations/sizes are sent to the allow-listed
//   diagnostics endpoint and appear in Vercel logs. No phone, filename, path,
//   URL, token or user agent is ever sent (server rejects unknown fields).
// - Measurement mode (`?measure=wifi|4g|5g|other`, `?measure=off` to stop):
//   events are tagged with the label so test runs can be separated from real
//   customers, and results are shown on screen for the tester.

import { sendUploadDiagnostic, type UploadTiming } from '../photoUpload/uploadClient'

export const MEASURE_LABELS = ['wifi', '4g', '5g', 'other'] as const
export type MeasureLabel = typeof MEASURE_LABELS[number]
const measureStorageKey = 'caspace.measure-label.v1'

export type SizeBand = '<1MB' | '1-3MB' | '3-6MB' | '6-12MB' | '>12MB'
export type DeviceClass = 'ios' | 'android' | 'other'
export type NetworkClass = 'wifi' | 'cellular' | '4g' | '3g' | '2g' | 'slow-2g' | 'unknown'

const MB = 1024 * 1024

export function sizeBand(bytes: number): SizeBand {
  if (bytes < MB) return '<1MB'
  if (bytes < 3 * MB) return '1-3MB'
  if (bytes < 6 * MB) return '3-6MB'
  if (bytes < 12 * MB) return '6-12MB'
  return '>12MB'
}

/** Coarse 3-value class only — the user agent itself is never sent. */
export function deviceClass(userAgent: string, maxTouchPoints = 0): DeviceClass {
  if (/android/i.test(userAgent)) return 'android'
  if (/iphone|ipad|ipod/i.test(userAgent) || (/macintosh/i.test(userAgent) && maxTouchPoints > 1)) return 'ios'
  return 'other'
}

interface ConnectionLike { type?: string; effectiveType?: string }

export function networkClass(connection: ConnectionLike | undefined): NetworkClass {
  if (!connection) return 'unknown'
  if (connection.type === 'wifi' || connection.type === 'ethernet') return 'wifi'
  if (connection.type === 'cellular' && !connection.effectiveType) return 'cellular'
  const effective = connection.effectiveType
  return effective === '4g' || effective === '3g' || effective === '2g' || effective === 'slow-2g' ? effective : 'unknown'
}

export function parseMeasureParam(value: string | null): MeasureLabel | 'off' | null {
  if (value === 'off') return 'off'
  return MEASURE_LABELS.includes(value as MeasureLabel) ? value as MeasureLabel : null
}

/** Reads `?measure=` once and remembers it for the tab (SPA navigation drops the query). */
export function measurementLabel(): MeasureLabel | null {
  try {
    const fromUrl = parseMeasureParam(new URLSearchParams(window.location.search).get('measure'))
    if (fromUrl === 'off') { sessionStorage.removeItem(measureStorageKey); return null }
    if (fromUrl) { sessionStorage.setItem(measureStorageKey, fromUrl); return fromUrl }
    return parseMeasureParam(sessionStorage.getItem(measureStorageKey)) as MeasureLabel | null
  } catch { return null }
}

export function newRunId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function environment() {
  const nav = navigator as Navigator & { connection?: ConnectionLike }
  return { device: deviceClass(nav.userAgent, nav.maxTouchPoints), network: networkClass(nav.connection), measure: measurementLabel() }
}

// Every builder copies fields explicitly (no spread) so extra properties such
// as a filename can never leak into the payload.
export function uploadFileEvent(runId: string, timing: UploadTiming, file: { size: number; type: string; name: string }) {
  const mime: 'png' | 'jpeg' = file.type === 'image/png' || /\.png$/i.test(file.name) ? 'png' : 'jpeg'
  return {
    kind: 'timing', event: 'upload-file', runId,
    hashMs: timing.hashMs, initializationMs: timing.initializationMs, transferMs: timing.transferMs, verificationMs: timing.verificationMs, totalMs: timing.totalMs,
    transport: timing.transport, tusFallback: timing.tusFallback, sizeBand: sizeBand(file.size), mime, bytes: file.size, transferRetries: timing.transferRetries,
  } as const
}

/** attempt = how many times the customer pressed "GỬI ẢNH" on this page; abandoned = page closed mid-upload. */
export function uploadBatchEvent(runId: string, input: { fileCount: number; okCount: number; failedCount: number; totalMs: number; totalBytes: number; attempt: number; abandoned?: boolean }) {
  return {
    kind: 'timing', event: 'upload-batch', runId,
    fileCount: input.fileCount, okCount: input.okCount, failedCount: input.failedCount, totalMs: Math.round(input.totalMs), totalBytes: input.totalBytes, attempt: input.attempt,
    outcome: input.abandoned ? 'abandoned' : input.failedCount > 0 || input.okCount < input.fileCount ? 'failed' : 'ok',
  } as const
}

export function frameSaveEvent(runId: string, input: { renderMs: number; deliveryMs: number; bytes: number; width: number; height: number; format: 'png' | 'jpg'; delivery: 'shared' | 'downloaded' | 'cancelled' }) {
  return {
    kind: 'timing', event: 'frame-save', runId,
    renderMs: Math.round(input.renderMs), deliveryMs: Math.round(input.deliveryMs), bytes: input.bytes, width: input.width, height: input.height, format: input.format, delivery: input.delivery,
  } as const
}

/** Fire-and-forget; never throws and never delays the customer flow. */
export function reportClientTiming(event: ReturnType<typeof uploadFileEvent> | ReturnType<typeof uploadBatchEvent> | ReturnType<typeof frameSaveEvent>) {
  void sendUploadDiagnostic({ ...event, ...environment() })
}

export const formatSeconds = (ms: number) => `${(ms / 1000).toFixed(1).replace('.', ',')} s`
export const formatMegabytes = (bytes: number) => `${(bytes / MB).toFixed(2).replace('.', ',')} MB`

const sumTiming = (timings: UploadTiming[], key: 'hashMs' | 'initializationMs' | 'transferMs' | 'verificationMs') => timings.reduce((total, timing) => total + timing[key], 0)

/** On-screen result for the tester in measurement mode (?measure=…). */
export function summarizeBatch(fileCount: number, okCount: number, totalMs: number, timings: UploadTiming[]) {
  const fallbacks = timings.filter((timing) => timing.tusFallback).length
  return [
    `ĐO [${measurementLabel() ?? '-'}] · ${okCount}/${fileCount} file · tổng ${formatSeconds(totalMs)}`,
    `Băm ${formatSeconds(sumTiming(timings, 'hashMs'))} · Khởi tạo ${formatSeconds(sumTiming(timings, 'initializationMs'))} · Truyền ${formatSeconds(sumTiming(timings, 'transferMs'))} · Kiểm tra ${formatSeconds(sumTiming(timings, 'verificationMs'))}`,
    fallbacks ? `TUS hỏng → gửi lại thường: ${fallbacks} file` : '',
  ].filter(Boolean).join('\n')
}
