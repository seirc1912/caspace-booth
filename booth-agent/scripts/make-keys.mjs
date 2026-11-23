#!/usr/bin/env node
// Tạo mã bí mật cho từng máy phòng chụp + giá trị BOOTH_UPLOAD_KEYS cho Vercel.
//   node booth-agent/scripts/make-keys.mjs booth-1 booth-2 booth-3 booth-4
// Mã gốc chỉ nhập vào config.json của từng máy; Vercel chỉ lưu hash.
import { createHash, randomInt } from 'node:crypto'

// 8 characters from 31 easy-to-read ones (no 0/O, 1/l/I): ~8.5e11 combinations —
// short enough to type, far beyond what the API rate limit lets anyone try.
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'
const KEY_LENGTH = 8
const makeKey = () => Array.from({ length: KEY_LENGTH }, () => ALPHABET[randomInt(ALPHABET.length)]).join('')

const ids = process.argv.slice(2)
if (!ids.length || ids.some((id) => !/^[a-z0-9-]{1,32}$/.test(id))) {
  console.error('Dùng: node make-keys.mjs booth-1 booth-2 …')
  process.exit(1)
}
const hashes = {}
console.log('Mã cho từng máy (nhập khi chạy install.ps1, không gửi qua chat):')
for (const id of ids) {
  const key = makeKey()
  hashes[id] = createHash('sha256').update(key).digest('hex')
  console.log(`  ${id}: ${key}`)
}
console.log('\nBOOTH_UPLOAD_KEYS (dán vào Vercel → Settings → Environment Variables):')
console.log(JSON.stringify(hashes))
