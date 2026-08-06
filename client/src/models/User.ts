export type UserRole = 'admin' | 'operator' | 'customer'
export type UserStatus = 'active' | 'invited' | 'disabled'

export interface User {
  id: string
  displayName: string
  email: string | null
  role: UserRole
  status: UserStatus
  brandId: string | null
  createdAt: string
  updatedAt: string
}

export interface UserSummary {
  id: string
  displayName: string
  role: UserRole
  status: UserStatus
}
