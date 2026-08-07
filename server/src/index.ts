import { createServer } from 'node:http'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import rateLimit from 'express-rate-limit'
import helmet from 'helmet'
import { Server } from 'socket.io'
import { createExportRouter } from './export/exportRouter.js'
import { SessionService } from './session/SessionService.js'
import { createSessionRouter } from './session/sessionRouter.js'
import { SupabasePhotoStore } from './photos/SupabasePhotoStore.js'
import { createPhotoRouter } from './photos/photoRouter.js'

const port = Number(process.env.PORT ?? 3000)
const allowedOrigins = (process.env.CLIENT_ORIGINS ?? 'https://booth.caspace.vn,http://localhost:5173').split(',').map((origin) => origin.trim())
const sessionSecret = process.env.SESSION_SECRET ?? (process.env.NODE_ENV === 'production' ? '' : 'selfbooth-development-secret-change-me')
const sessionService = new SessionService(sessionSecret)
const photoStore = new SupabasePhotoStore(process.env.SUPABASE_URL ?? '', process.env.SUPABASE_SERVICE_ROLE_KEY ?? '')
const clientDist = resolve(dirname(fileURLToPath(import.meta.url)), '../../client/dist')

const app = express()
const httpServer = createServer(app)
const io = new Server(httpServer, { cors: { origin: allowedOrigins } })

app.set('trust proxy', 1)
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }))
app.use(rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: 'draft-8', legacyHeaders: false }))
app.use(express.json({ limit: '64kb' }))

app.use((request, response, next) => {
  const origin = request.header('Origin')
  if (origin && allowedOrigins.includes(origin)) response.header('Access-Control-Allow-Origin', origin)
  response.header('Vary', 'Origin')
  response.header('Access-Control-Allow-Headers', 'Content-Type,X-Session-Token,X-Booth-Import-Key,X-Content-SHA256')
  response.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  if (request.method === 'OPTIONS') return response.sendStatus(204)
  next()
})
app.use('/api/sessions', createSessionRouter(sessionService, photoStore))
app.use('/api/photos', createPhotoRouter(photoStore, io, process.env.BOOTH_IMPORT_KEY ?? '', (sessionId, token) => sessionService.verify(sessionId, token)))
app.use('/api/exports', createExportRouter(sessionService))
app.get('/api/health', (_request, response) => response.json({ status: 'ok' }))
app.use(express.static(clientDist, { index: false, maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0 }))
app.use((request, response, next) => {
  if (request.method === 'GET' && !request.path.startsWith('/api/')) return response.sendFile(resolve(clientDist, 'index.html'))
  return next()
})

io.on('connection', (socket) => {
  const sessionId = String(socket.handshake.auth.sessionId ?? '')
  const token = String(socket.handshake.auth.token ?? '')
  if (!sessionService.verify(sessionId, token)) return socket.disconnect(true)
  void socket.join(`session:${sessionId}`)
})

httpServer.listen(port, '0.0.0.0', () => {
  console.log(`SelfBooth server listening on port ${port}`)
})
