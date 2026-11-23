// Local stand-in for Vercel Functions: serves client/api/**/*.ts on :3000 so the Vite
// dev server (/api proxy in client/vite.config.ts) and the booth agent can be tested
// against a LOCAL Supabase without `vercel dev` (which would pull Production env).
//   node --import tsx scripts/local-api-server.ts      (reads client/.env.local)
import { existsSync } from 'node:fs'
import { createServer, type IncomingMessage } from 'node:http'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const root = path.resolve(import.meta.dirname, '..')
const envFile = path.join(root, 'client', '.env.local')
if (existsSync(envFile)) process.loadEnvFile(envFile)
if (!process.env.SUPABASE_URL?.startsWith('http://')) throw new Error('client/.env.local must point SUPABASE_URL at the LOCAL Supabase (http://…), never Production.')

function routeFile(pathname: string) {
  const relative = pathname.replace(/^\/api\//, '').replace(/\/$/, '')
  if (!/^[a-z0-9/_-]+$/i.test(relative)) return null
  for (const candidate of [`${relative}.ts`, `${relative}/index.ts`]) {
    const file = path.join(root, 'client', 'api', candidate)
    if (existsSync(file) && !candidate.split('/').some((part) => part.startsWith('_'))) return file
  }
  return null
}

async function readBody(request: IncomingMessage) {
  const chunks: Buffer[] = []
  for await (const chunk of request) chunks.push(chunk as Buffer)
  const text = Buffer.concat(chunks).toString('utf8')
  if (!text) return undefined
  return (request.headers['content-type'] ?? '').includes('application/json') ? JSON.parse(text) as unknown : text
}

createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', 'http://local')
  const file = url.pathname.startsWith('/api/') ? routeFile(url.pathname) : null
  if (!file) { response.writeHead(404).end(); return }
  const started = Date.now()
  try {
    const module = await import(pathToFileURL(file).href) as { default: (req: unknown, res: unknown) => Promise<void> }
    const req = { method: request.method, headers: request.headers, body: await readBody(request), query: Object.fromEntries(url.searchParams) }
    const res = {
      status(code: number) { response.statusCode = code; return res },
      setHeader(name: string, value: string) { response.setHeader(name, value) },
      json(value: unknown) { if (!response.hasHeader('Content-Type')) response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify(value)) },
      send(value: unknown) { response.end(value as Buffer) },
      end(value?: unknown) { response.end(value as Buffer | undefined) },
      write(value: unknown) { return response.write(value as Buffer) },
    }
    await module.default(req, res)
  } catch (error) {
    console.error('[local-api]', error)
    if (!response.headersSent) response.writeHead(500).end()
  }
  console.log(`${request.method} ${url.pathname} → ${response.statusCode} (${Date.now() - started} ms)`)
}).listen(3000, '0.0.0.0', () => console.log('Local API on http://0.0.0.0:3000 →', process.env.SUPABASE_URL))
