/**
 * Admin-scope user model.
 * Mirrors iOS WhitelistedUser from Profile.swift — includes isAdmin + role
 * fields that the public-read profile model omits.
 *
 * Wire shape (snake_case from GET /admin/users-list):
 * {
 *   "id": "uuid",
 *   "email": "user@example.com",
 *   "sleeper_username": "username",
 *   "sleeper_user_id": "123456789",
 *   "display_name": "Display Name",
 *   "role": "member",
 *   "is_active": true,
 *   "is_admin": false
 * }
 */
export interface WhitelistedUser {
  id: string
  email: string
  sleeperUsername: string | null
  sleeperUserId: string | null
  displayName: string | null
  role: string | null
  isActive: boolean
  isAdmin: boolean
}

export interface WhitelistedUserRaw {
  id: string
  email: string
  sleeper_username?: string | null
  sleeper_user_id?: string | null
  display_name?: string | null
  role?: string | null
  is_active?: boolean
  is_admin?: boolean
}

export interface UsersListResponse {
  users: WhitelistedUserRaw[]
  count?: number
}

export interface UserUpdateResponse {
  Success?: boolean
  user_id?: string
  before?: unknown
  after?: unknown
}

export function mapWhitelistedUser(raw: WhitelistedUserRaw): WhitelistedUser {
  return {
    id: raw.id,
    email: raw.email,
    sleeperUsername: raw.sleeper_username ?? null,
    sleeperUserId: raw.sleeper_user_id ?? null,
    displayName: raw.display_name ?? null,
    role: raw.role ?? null,
    isActive: raw.is_active ?? false,
    isAdmin: raw.is_admin ?? false,
  }
}
