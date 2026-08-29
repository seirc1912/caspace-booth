import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { AdminRoom } from '../types'
import { RoomContext } from './RoomContext'
import { defaultRoom } from '../../../models/Room'
import { deleteAdminRoom, saveAdminRoom } from '../../../services/catalog/SupabaseCatalogService'
import { migrateLegacyCatalogOnce } from '../../../services/catalog/LegacyCatalogMigration'

const slugify = (value: string) => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'room'

export function RoomProvider({ children }: { children: ReactNode }) {
  const [rooms, setRooms] = useState<AdminRoom[]>([])


  useEffect(() => {
    let active = true
    void migrateLegacyCatalogOnce().then((catalog) => { if (active) setRooms(catalog.rooms) }).catch(console.error)
    return () => { active = false }
  }, [])

  const value = useMemo(() => ({
    rooms: [...rooms].sort((a, b) => a.sortOrder - b.sortOrder),
    create: async (name: string) => {
      const id = crypto.randomUUID()
      const room = { ...defaultRoom, id, name, slug: slugify(name), description: '', published: false, sortOrder: rooms.length }
      const saved = await saveAdminRoom(room)
      setRooms((current) => [...current, saved])
      return id
    },
    update: async (id: string, changes: Partial<Omit<AdminRoom, 'id'>>) => {
      const room = rooms.find((item) => item.id === id)
      if (!room) return
      const updated = { ...room, ...changes, ...(changes.name && !changes.slug ? { slug: slugify(changes.name) } : {}) }
      const saved = await saveAdminRoom(updated)
      setRooms((current) => current.map((item) => item.id === id ? saved : item))
    },
    remove: async (id: string) => {
      await deleteAdminRoom(id)
      setRooms((current) => current.filter((room) => room.id !== id))
    },
    reorder: async (id: string, direction: -1 | 1) => {
      const ordered = [...rooms].sort((a, b) => a.sortOrder - b.sortOrder)
      const index = ordered.findIndex((room) => room.id === id)
      const swap = index + direction
      if (index < 0 || swap < 0 || swap >= ordered.length) return
      ;[ordered[index], ordered[swap]] = [ordered[swap]!, ordered[index]!]
      const reordered = ordered.map((room, sortOrder) => ({ ...room, sortOrder }))
      for (const room of reordered) await saveAdminRoom(room)
      setRooms(reordered)
    },
  }), [rooms])

  return <RoomContext.Provider value={value}>{children}</RoomContext.Provider>
}
