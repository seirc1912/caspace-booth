import { clearLegacyCatalog, readLegacyRooms, readLegacyTemplates } from './RoomCatalogService'
import { loadAdminRooms, loadAdminTemplateSummaries, saveAdminRoom, saveAdminTemplate } from './SupabaseCatalogService'
import { defaultRoom } from '../../models/Room'

let migration: ReturnType<typeof runMigration> | null = null

async function runMigration() {
  const [remoteRooms, remoteTemplates] = await Promise.all([loadAdminRooms(), loadAdminTemplateSummaries()])
  const legacyRooms = readLegacyRooms()
  const legacyTemplates = readLegacyTemplates()
  let wrote = false

  if (remoteRooms.length === 0 && legacyRooms.length === 0 && legacyTemplates.length > 0) legacyRooms.push(defaultRoom)
  if (remoteRooms.length === 0 && legacyRooms.length > 0) {
    for (const room of legacyRooms) await saveAdminRoom(room)
    wrote = true
  }
  const availableRoomIds = new Set((remoteRooms.length ? remoteRooms : legacyRooms).map((room) => room.id))
  if (remoteTemplates.length === 0 && legacyTemplates.length > 0) {
    for (const [index, template] of legacyTemplates.entries()) {
      if (availableRoomIds.has(template.roomId)) await saveAdminTemplate(template, index)
    }
    wrote = true
  }
  clearLegacyCatalog()
  return wrote
    ? { rooms: await loadAdminRooms(), templates: await loadAdminTemplateSummaries() }
    : { rooms: remoteRooms, templates: remoteTemplates }
}

/** Imports browser-owned catalog data once, then removes it as application state. */
export function migrateLegacyCatalogOnce() {
  if (migration) return migration
  migration = runMigration().catch((error) => {
    migration = null
    throw error
  })
  return migration
}
