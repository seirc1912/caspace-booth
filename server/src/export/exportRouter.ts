import { Router } from 'express'
import multer from 'multer'
import rateLimit from 'express-rate-limit'
import { ExportService } from './ExportService.js'
import type { ExportManifest } from './types.js'
import type { SessionService } from '../session/SessionService.js'

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 40 * 1024 * 1024, files: 20, fields: 5 },
  fileFilter: (_request, file, callback) => callback(null, file.mimetype.startsWith('image/')),
})

export function createExportRouter(sessionService: SessionService) {
  const router = Router()
  const exportService = new ExportService()
  const exportLimit = rateLimit({ windowMs: 60_000, limit: 12, standardHeaders: 'draft-8', legacyHeaders: false })

  router.post('/', exportLimit, upload.any(), async (request, response) => {
    try {
      const manifest = JSON.parse(String(request.body.manifest ?? '')) as ExportManifest
      const token = request.header('X-Session-Token') ?? ''
      if (!sessionService.verify(manifest.sessionId, token)) return response.status(401).json({ error: 'Invalid or expired customer session' })
      const files = (request.files as Express.Multer.File[] | undefined) ?? []
      const images = new Map(files.map((file) => [file.fieldname, file.buffer]))
      const result = await exportService.create(manifest, images)
      return response.status(201).json(result)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Export failed'
      return response.status(400).json({ error: message })
    }
  })
  return router
}
