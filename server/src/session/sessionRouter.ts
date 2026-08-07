import { Router } from 'express'
import type { SessionService } from './SessionService.js'
import type { SupabasePhotoStore } from '../photos/SupabasePhotoStore.js'

export function createSessionRouter(sessionService: SessionService, photoStore: SupabasePhotoStore) {
  const router = Router()
  router.post('/', async (request, response) => {
    const boothId = String(request.body.boothId ?? '')
    const phoneNumber = String(request.body.phoneNumber ?? '')
    if (!boothId || !/^\+?\d{9,15}$/.test(phoneNumber)) return response.status(400).json({ error: 'Valid boothId and phoneNumber are required' })
    if (!(await photoStore.boothExists(boothId))) return response.status(400).json({ error: 'Invalid booth' })
    const session = sessionService.create()
    await photoStore.createSession({ sessionId: session.sessionId, boothId, phoneNumber })
    return response.status(201).json({ ...session, boothId, phoneNumber })
  })
  return router
}
