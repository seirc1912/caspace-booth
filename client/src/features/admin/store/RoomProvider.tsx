import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { AdminRoom } from '../types'
import { RoomContext } from './RoomContext'
import { defaultRoom } from '../../../models/Room'
import { readRooms, writeRooms } from '../../../services/catalog/RoomCatalogService'

const slugify = (value: string) => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'room'

export function RoomProvider({ children }: { children: ReactNode }) {
  const [rooms, setRooms] = useState(readRooms)
  useEffect(() => { writeRooms(rooms) }, [rooms])
  const value = useMemo(() => ({
    rooms: [...rooms].sort((a, b) => a.sortOrder - b.sortOrder),
    create: (name: string) => { const id = crypto.randomUUID(); setRooms((current) => [...current, { ...defaultRoom, id, name, slug: slugify(name), description: '', sortOrder: current.length }]); return id },
    update: (id: string, changes: Partial<Omit<AdminRoom, 'id'>>) => setRooms((current) => current.map((room) => room.id === id ? { ...room, ...changes, ...(changes.name && !changes.slug ? { slug: slugify(changes.name) } : {}) } : room)),
    remove: (id: string) => setRooms((current) => current.filter((room) => room.id !== id)),
    reorder: (id: string, direction: -1 | 1) => setRooms((current) => { const ordered = [...current].sort((a, b) => a.sortOrder - b.sortOrder); const index = ordered.findIndex((room) => room.id === id); const swap = index + direction; if (index < 0 || swap < 0 || swap >= ordered.length) return current; [ordered[index], ordered[swap]] = [ordered[swap]!, ordered[index]!]; return ordered.map((room, sortOrder) => ({ ...room, sortOrder })) }),
  }), [rooms])
  return <RoomContext.Provider value={value}>{children}</RoomContext.Provider>
}
