/**
 * Admin-scope league model.
 * Mirrors iOS WhitelistedLeague from WhitelistedLeague.swift.
 *
 * Wire shape (snake_case from GET /admin/leagues-list):
 * {
 *   "id": "uuid",
 *   "league_id": "sleeper-league-id",
 *   "league_name": "League Name",
 *   "season": "2025",
 *   "is_active": true,
 *   "is_dynasty": true,
 *   "has_taxi": true,
 *   "divisions": 2,
 *   "size": 12
 * }
 */
export interface WhitelistedLeague {
  id: string
  leagueId: string
  leagueName: string
  season: string
  isActive: boolean
  isDynasty: boolean
  hasTaxi: boolean
  divisions: number | null
  size: number | null
}

export interface WhitelistedLeagueRaw {
  id: string
  league_id: string
  league_name: string
  season: string
  is_active?: boolean
  is_dynasty?: boolean
  has_taxi?: boolean
  divisions?: number | null
  size?: number | null
}

export interface LeaguesListResponse {
  leagues: WhitelistedLeagueRaw[]
  count?: number
}

export interface LeagueUpdateResponse {
  Success?: boolean
  league_id?: string
  before?: unknown
  after?: unknown
}

export function mapWhitelistedLeague(raw: WhitelistedLeagueRaw): WhitelistedLeague {
  return {
    id: raw.id,
    leagueId: raw.league_id,
    leagueName: raw.league_name,
    season: raw.season,
    isActive: raw.is_active ?? false,
    isDynasty: raw.is_dynasty ?? false,
    hasTaxi: raw.has_taxi ?? false,
    divisions: raw.divisions ?? null,
    size: raw.size ?? null,
  }
}
