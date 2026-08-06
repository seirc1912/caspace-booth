export interface Room {
  id: string
  name: string
  slug: string
  description: string
  cover: string | null
  isActive: boolean
  sortOrder: number
}

export const defaultRoom: Room = {
  id: 'room-default',
  name: 'Cá Space',
  slug: 'ca-space',
  description: 'Our signature self-photo booth collection.',
  cover: null,
  isActive: true,
  sortOrder: 0,
}
