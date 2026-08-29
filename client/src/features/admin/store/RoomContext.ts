import { createContext, useContext } from 'react'
import type { AdminRoom } from '../types'

export interface RoomStoreValue {
  rooms: AdminRoom[]
  create: (name: string) => Promise<string>
  update: (id: string, changes: Partial<Omit<AdminRoom, 'id'>>) => Promise<void>
  remove: (id: string) => Promise<void>
  reorder: (id: string, direction: -1 | 1) => Promise<void>
}

export const RoomContext = createContext<RoomStoreValue | null>(null)
export function useRooms() {
  const value = useContext(RoomContext)
  if (!value) throw new Error('useRooms must be used within RoomProvider')
  return value
}
