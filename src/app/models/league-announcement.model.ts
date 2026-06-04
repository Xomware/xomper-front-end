/**
 * TS port of iOS LeagueAnnouncement.
 * Matches the Supabase league_announcements table shape.
 */
export interface LeagueAnnouncement {
  id: string
  title: string
  body: string
  priority: 'critical' | 'info'
  expiresAt: string | null   // ISO-8601 or null
  isActive: boolean
  displayOrder: number
  createdAt: string
  updatedAt: string
}

/** Wire shape returned by GET /announcements/list (snake_case). */
export interface LeagueAnnouncementRaw {
  id: string
  title: string
  body: string
  priority: 'critical' | 'info'
  expires_at: string | null
  is_active: boolean
  display_order: number
  created_at: string
  updated_at: string
}

export interface AnnouncementsListResponse {
  rows: LeagueAnnouncementRaw[]
}

/** Admin list — includes inactive + expired rows. */
export interface AdminAnnouncementsListResponse {
  Success?: boolean
  count?: number
  rows: LeagueAnnouncementRaw[]
  table_missing?: boolean
}

/** Response shape for create / update / delete mutations. */
export interface AnnouncementMutationResponse {
  Success?: boolean
  row: LeagueAnnouncementRaw
}

/** Input for create — all required fields. */
export interface AnnouncementCreateInput {
  title: string
  body: string
  priority: 'critical' | 'info'
  is_active: boolean
  display_order: number
  expires_at?: string | null
}

export function mapAnnouncement(raw: LeagueAnnouncementRaw): LeagueAnnouncement {
  return {
    id: raw.id,
    title: raw.title,
    body: raw.body,
    priority: raw.priority,
    expiresAt: raw.expires_at ?? null,
    isActive: raw.is_active,
    displayOrder: raw.display_order,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  }
}
