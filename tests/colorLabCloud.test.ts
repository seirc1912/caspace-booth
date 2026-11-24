import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (file: string) => readFileSync(new URL(`../client/src/${file}`, import.meta.url), 'utf8')

test('Cá Color Lab can take a booth photo or a sent photo from Supabase, as well as one from the phone', () => {
  const page = read('pages/ColorLabPage.tsx')
  assert.match(page, /onClick=\{openPicker\} variant="chrome">Từ điện thoại<\/Button>/)
  assert.match(page, /onClick=\{\(\) => setCloudOpen\(true\)\}>\{processing \? 'Đang mở ảnh…' : 'Ảnh phòng chụp'\}/)
  assert.match(page, /onClick=\{\(\) => setCloudOpen\(true\)\} variant="chrome">Ảnh khác/, '"Ảnh khác" offers both sources')
  assert.match(page, /onPicked=\{\(file\) => \{ setCloudOpen\(false\); void choosePhoto\(file\) \}\}/, 'the chosen original goes through the same on-device pipeline')
  const sheet = read('components/colorLab/CloudPhotoSheet.tsx')
  assert.match(sheet, /fetchBoothPhotos\(normalized\)/, 'same phone lookup (and rate limits) as the editor')
  assert.match(sheet, /onPicked\(await loader\.load\(photo\)\)/, 'only the one chosen original is downloaded')
  assert.match(sheet, /sessionStorage\.getItem\(journeyStorageKey\)/, 'phone typed on the home page is prefilled')
  assert.match(read('hooks/useSelfBooth.ts'), /const journeyStorageKey = 'selfbooth\.customer-journey\.v1'/)
  assert.match(sheet, /const journeyStorageKey = 'selfbooth\.customer-journey\.v1'/, 'same key as the home page journey')
  assert.match(sheet, /confirmLabel="Chỉnh màu ảnh này"/)
})
