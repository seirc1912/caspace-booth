import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

test('customer frames are exported as JPEG q0.95 at the exact template canvas size', () => {
  const download = read('../client/src/features/orders/services/downloadComposition.ts')
  assert.match(download, /export const CUSTOMER_EXPORT_FORMAT: ImageExportFormat = 'jpg'/)
  assert.match(download, /export const CUSTOMER_EXPORT_QUALITY = 0\.95/)
  assert.match(download, /format = CUSTOMER_EXPORT_FORMAT/)
  assert.match(download, /const filename = `caspace-\$\{timestamp\(\)\}\.\$\{format\}`/)
  const render = read('../client/src/features/orders/services/renderComposition.ts')
  assert.match(render, /canvas\.width = template\.canvas\.width; canvas\.height = template\.canvas\.height/, 'no downscaling: print resolution is preserved')
  assert.match(render, /if \(format === 'jpg'\) \{ context\.fillStyle = '#ffffff'; context\.fillRect/, 'transparent areas become white, not black')
  assert.match(render, /format === 'jpg' \? options\.quality \?\? 0\.95/)
})

test('the /upload-anh page accepts the exported .jpg files', () => {
  const page = read('../client/src/pages/PhotoUploadPage.tsx')
  assert.match(page, /accept="\.png,\.jpg,\.jpeg,image\/png,image\/jpeg"/)
})
