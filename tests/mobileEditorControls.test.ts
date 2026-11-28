import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('"Khung khác" sheet lists every frame of the room with its done / in-progress / empty state', () => {
  const sheet = readFileSync(new URL('../client/src/components/editor/FrameSwitcherSheet.tsx', import.meta.url), 'utf8')
  const composer = readFileSync(new URL('../client/src/pages/ComposerPage.tsx', import.meta.url), 'utf8')
  const app = readFileSync(new URL('../client/src/CustomerApp.tsx', import.meta.url), 'utf8')
  assert.match(sheet, /frames\.map\(\(frame, index\)/)
  assert.match(sheet, /aria-current=\{current \? 'true' : undefined\}/)
  assert.match(sheet, /'Đủ ảnh'/)
  assert.match(sheet, /`Đã ghép \$\{frame\.filledCount\}\/\$\{frame\.slotCount\} ô`/)
  assert.match(sheet, /Chưa có ảnh/)
  assert.match(composer, /<FrameSwitcherSheet/)
  assert.match(composer, /onSelectFrame\(index\)/)
  assert.match(app, /frames=\{editorFrames\}/)
  assert.doesNotMatch(composer, /FrameSelector|Frame \{frameIndex \+ 1\}/, 'the Frame 1–10 tab row is gone')
})
