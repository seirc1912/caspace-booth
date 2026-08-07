import { clearLegacyCatalog, readLegacyRooms, readLegacyTemplates } from './RoomCatalogService'
import { loadAdminRooms, loadAdminTemplates, saveAdminRoom, saveAdminTemplate } from './SupabaseCatalogService'
import { defaultRoom } from '../../models/Room'

let migration: Promise<void> | null = null

/** Imports browser-owned catalog data once, then removes it as application state. */
export function migrateLegacyCatalogOnce() {
  if (migration) return migration
  migration = (async () => {
    const [remoteRooms, remoteTemplates] = await Promise.all([loadAdminRooms(), loadAdminTemplates()])
    const legacyRooms = readLegacyRooms()
    const legacyTemplates = readLegacyTemplates()

    if (remoteRooms.length === 0 && legacyRooms.length === 0 && legacyTemplates.length > 0) legacyRooms.push(defaultRoom)

    if (remoteRooms.length === 0 && legacyRooms.length > 0) {
      for (const room of legacyRooms) await saveAdminRoom(room)
    }

    const availableRoomIds = new Set((remoteRooms.length ? remoteRooms : legacyRooms).map((room) => room.id))
    if (remoteTemplates.length === 0 && legacyTemplates.length > 0) {
      for (const [index, template] of legacyTemplates.entries()) {
        if (availableRoomIds.has(template.roomId)) await saveAdminTemplate(template, index)
      }
    }

    clearLegacyCatalog()
  })().catch((error) => {
    migration = null
    throw error
  })
  return migration
}
