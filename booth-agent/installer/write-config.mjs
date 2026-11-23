// Called by Setup.exe (elevated) to create or update config.json.
// Empty arguments keep the existing value, so re-running Setup to upgrade never
// forces staff to re-enter the booth key.
//   node write-config.mjs <config.json> <boothId> <boothKey> <apiBaseUrl> <watchRoot>
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

const [file, boothId, boothKey, apiBaseUrl, watchRoot] = process.argv.slice(2)
const current = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {}
const next = {
  apiBaseUrl: (apiBaseUrl || current.apiBaseUrl || 'https://caspace.vn').trim().replace(/\/$/, ''),
  boothId: (boothId || current.boothId || '').trim(),
  boothKey: (boothKey || current.boothKey || '').trim(),
  watchRoot: (watchRoot || current.watchRoot || 'C:\\Users\\ADMIN\\Pictures').trim(),
  concurrency: current.concurrency ?? 1,
  statusPort: current.statusPort ?? 47821,
}
const problems = []
if (!/^https?:\/\/\S+$/.test(next.apiBaseUrl)) problems.push('Địa chỉ máy chủ phải bắt đầu bằng https://')
if (!/^[a-z0-9-]{1,32}$/.test(next.boothId)) problems.push('Mã phòng không hợp lệ (ví dụ booth-1)')
if (next.boothKey.length < 16) problems.push('Mã bí mật phải có ít nhất 16 ký tự')
if (!existsSync(next.watchRoot)) problems.push(`Không thấy thư mục ảnh: ${next.watchRoot}`)
if (problems.length) { console.error(problems.join('\n')); process.exit(2) }
writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`)
console.log('ok')
