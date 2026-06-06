/**
 * Raw shape of a single entry from the FantasyCalc values API.
 * Each entry is a top-level object with a nested `player` object.
 *
 * FantasyCalc response shape (relevant fields only):
 * {
 *   player: { sleeperId, position, name, ... },
 *   value: number,
 *   overallRank: number,
 *   positionRank: number,
 *   trend30Day: number,
 *   ...
 * }
 *
 * Port of iOS `PlayerValue.swift`.
 */
export interface FantasyCalcPlayerRaw {
  player: {
    sleeperId: string | null
    position: string | null
    name: string | null
    [key: string]: unknown
  }
  value: number
  overallRank: number | null
  positionRank: number | null
  trend30Day: number | null
  [key: string]: unknown
}

/**
 * Normalized player-value entry after parsing the FantasyCalc response.
 * Port of the relevant fields from iOS `PlayerValue.swift`.
 */
export interface PlayerValue {
  /** Sleeper player ID. Null for draft picks. */
  sleeperId: string | null
  /** Dynasty value (0–~10000). */
  value: number
  /** Position string (QB/RB/WR/TE/PICK). */
  position: string | null
  /** Display name: "Josh Allen" for players, "2026 Pick 1.01" for picks. */
  name: string | null
  overallRank: number | null
  positionRank: number | null
  trend30Day: number | null
  /** True when this entry represents a draft pick, not a player. */
  isPick: boolean
}

/** Parse and normalize a raw FantasyCalc entry into a `PlayerValue`. */
export function parsePlayerValue(raw: FantasyCalcPlayerRaw): PlayerValue {
  const sleeperId = raw.player.sleeperId ?? null
  const position = raw.player.position ?? null
  const isPick =
    !sleeperId ||
    sleeperId.trim() === '' ||
    position?.toUpperCase() === 'PICK'

  return {
    sleeperId,
    value: raw.value ?? 0,
    position,
    name: raw.player.name ?? null,
    overallRank: raw.overallRank ?? null,
    positionRank: raw.positionRank ?? null,
    trend30Day: raw.trend30Day ?? null,
    isPick,
  }
}

/**
 * Parse the leading 4-digit year prefix from a FantasyCalc pick name.
 * e.g. "2026 Pick 1.01" → 2026, "2027 1st" → 2027.
 * Returns null if the name does not start with a 4-digit token.
 * Port of iOS `parseYearPrefix(_:)`.
 */
export function parseYearPrefix(name: string): number | null {
  const trimmed = name.trim()
  const prefix = trimmed.slice(0, 4)
  if (prefix.length < 4) return null
  const year = parseInt(prefix, 10)
  return isNaN(year) ? null : year
}
