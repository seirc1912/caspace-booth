import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import { GoogleDriveUploadService } from '../client/api/_lib/googleDrive.ts'
import { UploadApiError } from '../client/api/_lib/http.ts'
import { hasValidImageSignature, normalizeVietnamesePhone as normalizeServerPhone, parseUploadMetadata, sanitizeFilename } from '../client/api/_lib/uploadValidation.ts'
import { sha256Blob } from '../client/src/features/photoUpload/uploadClient.ts'
import { isValidVietnamesePhone, normalizeVietnamesePhone, validateSelectedFiles } from '../client/src/features/photoUpload/validation.ts'

const pngPrefix = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]).toString('base64')
const jpegPrefix = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46]).toString('base64')

function jsonResponse(value: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(value), { status: 200, headers: { 'Content-Type': 'application/json', ...init.headers }, ...init })
}

function metadata(overrides: Record<string, unknown> = {}) {
  return parseUploadMetadata({ phone: '0901234567', filename: 'frame.png', mimeType: 'image/png', size: 12, prefix: pngPrefix, sha256: 'a'.repeat(64), requestId: 'request_12345678', ...overrides })
}

test('Vietnamese phone numbers normalize consistently and reject invalid prefixes', () => {
  for (const value of ['090 123 4567', '+84 901 234 567', '84901234567']) {
    assert.equal(normalizeVietnamesePhone(value), '0901234567')
    assert.equal(normalizeServerPhone(value), '0901234567')
    assert.equal(isValidVietnamesePhone(value), true)
  }
  assert.equal(isValidVietnamesePhone('0201234567'), false)
  assert.equal(isValidVietnamesePhone('090123456'), false)
})

test('PNG and JPEG magic bytes must agree with MIME type and extension', () => {
  assert.equal(hasValidImageSignature(pngPrefix, 'image/png'), true)
  assert.equal(hasValidImageSignature(jpegPrefix, 'image/jpeg'), true)
  assert.equal(hasValidImageSignature(pngPrefix, 'image/jpeg'), false)
  assert.throws(() => metadata({ mimeType: 'image/jpeg' }), UploadApiError)
  assert.throws(() => metadata({ prefix: Buffer.from('not an image').toString('base64') }), UploadApiError)
})

test('selection limits enforce type, per-file size, count, and total size', () => {
  assert.equal(validateSelectedFiles([{ name: 'one.png', type: 'image/png', size: 100 }, { name: 'two.jpg', type: 'image/jpeg', size: 200 }]), null)
  assert.match(validateSelectedFiles([{ name: 'bad.gif', type: 'image/gif', size: 100 }]) ?? '', /không phải ảnh/)
  assert.match(validateSelectedFiles([{ name: 'huge.png', type: 'image/png', size: 26 * 1024 * 1024 }]) ?? '', /25 MB/)
  assert.match(validateSelectedFiles(Array.from({ length: 21 }, (_, index) => ({ name: `${index}.png`, type: 'image/png', size: 1 }))) ?? '', /20 ảnh/)
  assert.match(validateSelectedFiles(Array.from({ length: 20 }, (_, index) => ({ name: `${index}.png`, type: 'image/png', size: 13 * 1024 * 1024 }))) ?? '', /250 MB/)
})

test('filename sanitization removes path traversal and control characters', () => {
  assert.equal(sanitizeFilename('../folder/\u0000 portrait  01.png'), 'portrait 01.png')
  assert.throws(() => sanitizeFilename('../..'), UploadApiError)
})

test('SHA-256 of the browser upload Blob matches the untouched original bytes', async () => {
  const original = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...Array.from({ length: 4096 }, (_, index) => index % 251)])
  const expected = createHash('sha256').update(original).digest('hex')
  assert.equal(await sha256Blob(new Blob([original])), expected)
})

test('Drive folder lookup reuses an existing normalized-phone folder', async () => {
  let calls = 0
  const fetchMock: typeof fetch = async (_input, init) => {
    calls += 1
    assert.equal(init?.method, undefined)
    return jsonResponse({ files: [{ id: 'folder_existing_123', name: '0901234567' }] })
  }
  const service = new GoogleDriveUploadService('token', 'parent_folder_123', fetchMock)
  assert.equal(await service.findOrCreateCustomerFolder('0901234567'), 'folder_existing_123')
  assert.equal(calls, 1)
})

test('Drive folder creation is shared by concurrent requests in one serverless instance', async () => {
  let listCalls = 0
  let createCalls = 0
  const fetchMock: typeof fetch = async (_input, init) => {
    if (init?.method === 'POST') { createCalls += 1; return jsonResponse({ id: 'folder_new_123' }) }
    listCalls += 1
    await new Promise((resolve) => setTimeout(resolve, 5))
    return jsonResponse({ files: listCalls === 1 ? [] : [{ id: 'folder_new_123', name: '0901234567' }] })
  }
  const first = new GoogleDriveUploadService('token', 'parent_folder_123', fetchMock)
  const second = new GoogleDriveUploadService('token', 'parent_folder_123', fetchMock)
  assert.deepEqual(await Promise.all([first.findOrCreateCustomerFolder('0901234567'), second.findOrCreateCustomerFolder('0901234567')]), ['folder_new_123', 'folder_new_123'])
  assert.equal(createCalls, 1)
  assert.equal(listCalls, 2)
})

test('resumable upload reuses completed requests and never overwrites duplicate filenames', async () => {
  const responses = [
    jsonResponse({ files: [] }),
    jsonResponse({ files: [{ id: 'old_file_123', name: 'frame.png' }, { id: 'old_file_456', name: 'frame (2).png' }] }),
    jsonResponse({}, { headers: { Location: 'https://www.googleapis.com/upload/drive/v3/files?upload_id=safe' } }),
  ]
  let body = ''
  const fetchMock: typeof fetch = async (_input, init) => {
    if (init?.method === 'POST' && typeof init.body === 'string') body = init.body
    return responses.shift()!
  }
  const service = new GoogleDriveUploadService('token', 'parent_folder_123', fetchMock)
  const prepared = await service.createResumableUpload('folder_existing_123', metadata())
  assert.equal(prepared.alreadyUploaded, false)
  assert.equal(JSON.parse(body).name, 'frame (3).png')

  const idempotentFetch: typeof fetch = async () => jsonResponse({ files: [{ id: 'file_done_123', parents: ['folder_existing_123'], size: '12', appProperties: { sha256: 'a'.repeat(64), uploadRequestId: 'request_12345678' } }] })
  const idempotentService = new GoogleDriveUploadService('token', 'parent_folder_123', idempotentFetch)
  assert.deepEqual(await idempotentService.createResumableUpload('folder_existing_123', metadata()), { alreadyUploaded: true, fileId: 'file_done_123', folderId: 'folder_existing_123' })
})

test('completion verifies Drive file integrity metadata and parent hierarchy', async () => {
  const responses = [
    jsonResponse({ id: 'file_done_123', size: '12', sha256Checksum: 'a'.repeat(64), mimeType: 'image/png', parents: ['folder_existing_123'], appProperties: { sha256: 'a'.repeat(64), uploadRequestId: 'request_12345678' } }),
    jsonResponse({ id: 'folder_existing_123', mimeType: 'application/vnd.google-apps.folder', parents: ['parent_folder_123'], trashed: false }),
  ]
  const service = new GoogleDriveUploadService('token', 'parent_folder_123', async () => responses.shift()!)
  const verified = await service.verifyCompletedUpload({ fileId: 'file_done_123', folderId: 'folder_existing_123', mimeType: 'image/png', size: 12, sha256: 'a'.repeat(64), requestId: 'request_12345678' })
  assert.equal(verified.id, 'file_done_123')
})

test('a partial Google Drive failure remains an error and never becomes success', async () => {
  const service = new GoogleDriveUploadService('token', 'parent_folder_123', async () => jsonResponse({ error: 'unavailable' }, { status: 503 }))
  await assert.rejects(() => service.findOrCreateCustomerFolder('0901234567'), UploadApiError)
})
