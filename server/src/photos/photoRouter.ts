import { createHash } from 'node:crypto'
import { Router } from 'express'
import multer from 'multer'
import type { Server } from 'socket.io'
import type { SupabasePhotoStore } from './SupabasePhotoStore.js'

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024, files: 1 } })

export function createPhotoRouter(store: SupabasePhotoStore, io: Server, importKey: string, verifySession: (sessionId: string, token: string) => boolean) {
  const router = Router()
  router.get('/session/:sessionId', async (request, response) => {
    const token = String(request.header('X-Session-Token') ?? '')
    if (!verifySession(request.params.sessionId, token)) return response.status(401).json({ error: 'Invalid session' })
    return response.json(await store.sessionPhotos(request.params.sessionId))
  })
  router.post('/import', upload.single('photo'), async (request, response) => {
    try {
      if (importKey && request.header('X-Booth-Import-Key') !== importKey) return response.status(401).json({ error: 'Invalid booth import key' })
      const boothId = String(request.body.boothId ?? '')
      if (!boothId || !(await store.boothExists(boothId))) return response.status(400).json({ error: 'Invalid booth' })
      if (!request.file || !/image\/jpeg/.test(request.file.mimetype)) return response.status(400).json({ error: 'A JPG photo is required' })
      const sessionId = await store.activeSession(boothId)
      if (!sessionId) return response.status(202).json({ ignored: true, reason: 'No active session' })
      const contentHash = request.header('X-Content-SHA256') || createHash('sha256').update(request.file.buffer).digest('hex')
      const photo = await store.importPhoto({ boothId, sessionId, sourceName: request.file.originalname, contentHash, bytes: request.file.buffer })
      if (!photo) return response.status(200).json({ duplicate: true })
      io.to(`session:${sessionId}`).emit('photo:imported', photo)
      return response.status(201).json(photo)
    } catch (error) {
      console.error('PHOTO IMPORT FAILURE', error)
      return response.status(500).json({ error: error instanceof Error ? error.message : 'Photo import failed' })
    }
  })
  return router
}
