// src/app/models/draft.interface.ts
export interface DraftSettings {
  teams: number
  slots_wr: number
  slots_te: number
  slots_rb: number
  slots_qb: number
  slots_k: number
  slots_flex: number
  slots_def: number
  slots_bn: number
  rounds: number
  pick_timer: number
  /** Sleeper's third-round-reversal knob. 0 or absent means a plain snake. */
  reversal_round?: number
}

export interface DraftMetadata {
  scoring_type: string
  name: string
  description: string
}

export interface DraftPickMetadata {
  team: string
  status: string
  sport: string
  position: string
  player_id: string
  number: string
  news_updated: string
  last_name: string
  injury_status: string
  first_name: string
}

export interface DraftPick {
  player_id: string
  picked_by: string // user_id, can be ""
  roster_id: string
  round: number
  draft_slot: number
  pick_no: number
  metadata: DraftPickMetadata
  is_keeper: boolean | null
  draft_id: string
}

export interface Draft {
  draft_id: string
  league_id: string
  type: string
  status: string
  start_time: number
  sport: string
  settings: DraftSettings
  season_type: string
  season: string
  metadata: DraftMetadata
  last_picked: number
  last_message_time: number
  last_message_id: string
  draft_order: Record<string, number> | null
  creators: string[] | null
  created: number
  picks?: DraftPick[] // populated after fetching picks
}
