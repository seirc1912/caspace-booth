#!/usr/bin/env node
// Builds booth-agent/build/CaspaceBoothSetup-<version>.exe on macOS/Linux:
//   brew install makensis   (once)
//   node booth-agent/installer/build.mjs
// The installer carries its own Node.js (Windows x64) + the Windows build of sharp,
// so booth PCs need nothing pre-installed and no terminal.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { build } from 'esbuild'

const NODE_VERSION = 'v22.23.5'
const agentDir = path.resolve(import.meta.dirname, '..')
const buildDir = path.join(agentDir, 'build')
const payload = path.join(buildDir, 'payload')
const cache = path.join(buildDir, 'cache')
const pkg = JSON.parse(readFileSync(path.join(agentDir, 'package.json'), 'utf8'))
const run = (command, args, options = {}) => execFileSync(command, args, { stdio: 'inherit', ...options })

rmSync(payload, { recursive: true, force: true })
mkdirSync(path.join(payload, 'app'), { recursive: true })
mkdirSync(path.join(payload, 'node'), { recursive: true })
mkdirSync(path.join(payload, 'installer'), { recursive: true })
mkdirSync(cache, { recursive: true })

console.log('1/4 Bundle agent')
await build({
  entryPoints: [path.join(agentDir, 'src', 'main.ts')],
  outfile: path.join(payload, 'app', 'agent.mjs'),
  bundle: true, platform: 'node', format: 'esm', target: 'node22',
  external: ['sharp', 'node-notifier'],
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  logLevel: 'warning',
})

console.log('2/4 Windows dependencies (sharp win32-x64, node-notifier)')
writeFileSync(path.join(payload, 'app', 'package.json'), JSON.stringify({ name: 'caspace-booth-agent', version: pkg.version, private: true, type: 'module', dependencies: { sharp: pkg.dependencies.sharp, 'node-notifier': pkg.dependencies['node-notifier'] } }, null, 2))
run('npm', ['install', '--omit=dev', '--os=win32', '--cpu=x64', '--no-package-lock', '--no-audit', '--no-fund', '--ignore-scripts'], { cwd: path.join(payload, 'app') })
if (!existsSync(path.join(payload, 'app', 'node_modules', '@img', 'sharp-win32-x64'))) throw new Error('sharp Windows binaries missing (@img/sharp-win32-x64)')

console.log(`3/4 Node.js ${NODE_VERSION} for Windows x64`)
const zipName = `node-${NODE_VERSION}-win-x64.zip`
const zipPath = path.join(cache, zipName)
if (!existsSync(zipPath)) run('curl', ['-fsSL', '-o', zipPath, `https://nodejs.org/dist/${NODE_VERSION}/${zipName}`])
const sums = execFileSync('curl', ['-fsSL', `https://nodejs.org/dist/${NODE_VERSION}/SHASUMS256.txt`], { encoding: 'utf8' })
const expected = sums.split('\n').find((line) => line.endsWith(`  ${zipName}`))?.split(' ')[0]
const actual = createHash('sha256').update(readFileSync(zipPath)).digest('hex')
if (!expected || expected !== actual) { rmSync(zipPath); throw new Error(`Node.js checksum mismatch for ${zipName}`) }
run('unzip', ['-q', '-o', '-j', zipPath, `node-${NODE_VERSION}-win-x64/node.exe`, '-d', path.join(payload, 'node')])

console.log('4/4 Installer')
for (const file of ['write-config.mjs', 'register-task.mjs', 'task.xml']) copyFileSync(path.join(agentDir, 'installer', file), path.join(payload, 'installer', file))
copyFileSync(path.join(agentDir, 'installer', 'launcher.vbs'), path.join(payload, 'launcher.vbs'))
cpSync(path.join(agentDir, 'README.md'), path.join(payload, 'README.md'))
const outFile = path.join(buildDir, `CaspaceBoothSetup-${pkg.version}.exe`)
run('makensis', ['-V2', `-DVERSION=${pkg.version}`, `-DPAYLOAD=${payload}`, `-DOUTFILE=${outFile}`, path.join(agentDir, 'installer', 'installer.nsi')])
const size = readFileSync(outFile).length
console.log(`\n✓ ${path.relative(process.cwd(), outFile)} (${(size / 1024 / 1024).toFixed(1)} MB)`)
console.log(`  SHA-256 ${createHash('sha256').update(readFileSync(outFile)).digest('hex')}`)
