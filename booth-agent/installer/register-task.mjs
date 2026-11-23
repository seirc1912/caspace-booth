// Called by Setup.exe: (re)creates the logon task that runs launcher.vbs hidden and
// restarts the agent if it stops. schtasks needs the XML as UTF-16 LE with a BOM.
//   node register-task.mjs <installDir> <task.xml template>
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const [installDir, template] = process.argv.slice(2)
const xml = readFileSync(template, 'utf8').replaceAll('__INSTDIR__', installDir)
const target = join(installDir, 'task.generated.xml')
writeFileSync(target, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(xml, 'utf16le')]))
const name = 'Caspace Booth Agent'
spawnSync('schtasks', ['/End', '/TN', name], { stdio: 'ignore' })
const created = spawnSync('schtasks', ['/Create', '/TN', name, '/XML', target, '/F'], { encoding: 'utf8' })
if (created.status !== 0) { console.error(created.stderr || created.stdout); process.exit(created.status ?? 1) }
const run = spawnSync('schtasks', ['/Run', '/TN', name], { encoding: 'utf8' })
console.log(run.status === 0 ? 'ok' : `created, start failed: ${run.stderr}`)
