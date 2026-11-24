import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('the crop bar lock button locks the photo; a locked slot cannot be dragged, pinched, reset or re-cropped', () => {
  const cropBar = readFileSync('client/src/components/editor/CropToolbar.tsx', 'utf8')
  assert.match(cropBar, /aria-label="Khoá ảnh, giữ cách cắt này"[^>]*onClick=\{onDone\}[^>]*><Icon name="unlock" \/>/)
  assert.doesNotMatch(cropBar, /name="check"/)
  const composer = readFileSync('client/src/pages/ComposerPage.tsx', 'utf8')
  assert.match(composer, /const finishCrop = \(\) => \{ if \(crop\) setLocked\(crop\.index, true\); setCrop\(null\) \}/)
  assert.match(composer, /if \(!slot \|\| isLocked\(index\)\) return/, 'double-tap cannot reopen cropping on a locked photo')
  assert.match(composer, /`\$\{template\.id\}:\$\{index\}:\$\{slot\.photo\.id\}`/, 'replacing the photo unlocks the slot')
  assert.match(composer, /if \(isLocked\(currentSlot\)\) unlockAndCrop\(currentSlot\); else beginCrop\(currentSlot\)/)
  const canvas = readFileSync('client/src/components/editor/TemplateCanvas.tsx', 'utf8')
  assert.match(canvas, /cropMode=\{!lockedSlots\.includes\(index\) && \(cropSlot === index \|\| activeSlot === index\)\}/, 'the selected slot no longer moves once locked')
  const frame = readFileSync('client/src/components/editor/PhotoFrame.tsx', 'utf8')
  assert.match(frame, /imageReady && !locked && onBeginCrop\(\)/)
  assert.match(frame, /aria-label="Ảnh đã khoá"/)
  const toolbar = readFileSync('client/src/components/editor/EditorToolbar.tsx', 'utf8')
  assert.match(toolbar, /icon="lock" label="Mở khoá"/)
  assert.match(toolbar, /disabled=\{disabled \|\| !hasPhoto \|\| locked\} icon="zoomIn"/, '"Phóng to" cannot move a locked photo')
})
