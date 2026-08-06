import { Router } from 'express'
import type { SessionService } from './SessionService.js'

export function createSessionRouter(sessionService: SessionService) {
  const router = Router()
  router.post('/', (_request, response) => response.status(201).json(sessionService.create()))
  return router
}
