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
// Exit codes (no text: NSIS reads child output as ANSI, Vietnamese would be garbled;
// installer.nsi shows the matching Vietnamese message):
//   10 server URL, 11 booth id, 12 key shorter than 8, 13 photo folder missing
if (!/^https?:\/\/\S+$/.test(next.apiBaseUrl)) process.exit(10)
if (!/^[a-z0-9-]{1,32}$/.test(next.boothId)) process.exit(11)
if (next.boothKey.length < 8) process.exit(12)
if (!existsSync(next.watchRoot)) process.exit(13)
writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`)
