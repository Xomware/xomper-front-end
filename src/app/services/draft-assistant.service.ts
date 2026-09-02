import { Injectable } from '@angular/core'
import { DraftPick } from '../models/draft.interface'
import { ValueBook } from '../models/value-book.model'

/** How to weight the board. */
export type StrategyPreset = 'bpa' | 'needs' | 'rb-heavy' | 'wr-heavy' | 'qb-early'

export const STRATEGY_LABELS: Record<StrategyPreset, string> = {
  bpa: 'Best available',
  needs: 'Fill my needs',
  'rb-heavy': 'RB heavy',
  'wr-heavy': 'WR heavy',
  'qb-early': 'QB early',
}

/** The user's own tweaks on top of a preset. */
export interface BoardPrefs {
  preset: StrategyPreset
  /** Player ids to float to the top regardless of value. */
  likes: Set<string>
  /** Player ids to bury. Never suggested while anything else remains. */
  dislikes: Set<string>
}

export function emptyPrefs(): BoardPrefs {
  return { preset: 'bpa', likes: new Set(), dislikes: new Set() }
}

/** One row on the suggestion board. */
export interface DraftCandidate {
  playerId: string
  name: string
  position: string
  /** Raw value from the league's book. */
  value: number
  /** Value after the strategy is applied. What the list is sorted on. */
  score: number
  /** Why this sits where it does, e.g. "RB heavy" or "You need RB". */
  reason: string
  liked: boolean
}

interface PlayerMeta {
  first_name?: string
  last_name?: string
  position?: string
}

/** Positions worth suggesting. Everything else is noise on a draft board. */
const DRAFTABLE = new Set(['QB', 'RB', 'WR', 'TE'])

/** Preset -> position -> multiplier. Absent means 1. */
const PRESET_WEIGHTS: Record<StrategyPreset, Record<string, number>> = {
  bpa: {},
  needs: {},
  'rb-heavy': { RB: 1.25 },
  'wr-heavy': { WR: 1.25 },
  'qb-early': { QB: 1.35 },
}

/**
 * Roughly how many of each position a team wants before it stops being a
 * need. Not a lineup requirement — a guide for the "fill my needs" preset,
 * which only has to be directionally right to be useful mid-draft.
 */
const TARGET_COUNTS: Record<string, number> = { QB: 2, RB: 5, WR: 5, TE: 2 }

/** Weight applied per position the user is still short of the target. */
const NEED_STEP = 0.12

/**
 * Ranks who is left on the board.
 *
 * The live draft page already showed what had happened — picks, order, a
 * countdown — with no reference to player values at all. It could tell you
 * the pick was in, not whether it was a good one, and it had nothing to say
 * about who to take next.
 *
 * The ranking is deliberately explainable: a multiplier on the league's own
 * value, with the reason carried on every row. A user disagreeing with the
 * order can see why it came out that way and override it with likes and
 * dislikes, which is more useful than a better-hidden model.
 */
@Injectable({ providedIn: 'root' })
export class DraftAssistantService {
  /**
   * Player ids already taken in this draft.
   *
   * Picks carry `player_id`; anything falsy is a pick that has not resolved
   * yet, not an available player.
   */
  draftedIds(picks: DraftPick[]): Set<string> {
    return new Set(picks.map((p) => p.player_id).filter(Boolean))
  }

  /**
   * Everyone already on a roster in this league.
   *
   * In a dynasty league almost nobody in the pool is actually free: they were
   * drafted in an earlier season and kept, so they never appear in this
   * draft's picks. Ranking on picks alone offered players who have been
   * rostered for years as "best available".
   */
  rosteredIds(rosters: Array<{ players?: string[] | null }>): Set<string> {
    const ids = new Set<string>()
    for (const roster of rosters) {
      for (const playerId of roster.players ?? []) {
        if (playerId) ids.add(playerId)
      }
    }
    return ids
  }

  /** How many of each position the given user has taken so far. */
  positionCounts(
    picks: DraftPick[],
    playerMap: Record<string, PlayerMeta>,
    userId: string | null,
  ): Record<string, number> {
    const counts: Record<string, number> = {}
    if (!userId) return counts

    for (const pick of picks) {
      if (pick.picked_by !== userId || !pick.player_id) continue
      const position = playerMap[pick.player_id]?.position
      if (!position) continue
      counts[position] = (counts[position] ?? 0) + 1
    }
    return counts
  }

  /**
   * The board, best first.
   *
   * `limit` exists because a draft pool is thousands of players and nobody
   * scrolls past the top of it mid-pick.
   */
  suggest(
    picks: DraftPick[],
    playerMap: Record<string, PlayerMeta>,
    book: ValueBook,
    prefs: BoardPrefs,
    myUserId: string | null,
    limit = 25,
    /**
     * Already rostered, so unavailable regardless of this draft. Empty for a
     * startup draft, where every pick is the only claim on a player.
     */
    rostered: Set<string> = new Set(),
  ): DraftCandidate[] {
    const drafted = this.draftedIds(picks)
    const counts = this.positionCounts(picks, playerMap, myUserId)

    const candidates: DraftCandidate[] = []

    for (const playerId of book.playerIds) {
      if (drafted.has(playerId) || rostered.has(playerId)) continue

      const meta = playerMap[playerId]
      const position = meta?.position ?? book.position(playerId) ?? ''
      if (!DRAFTABLE.has(position)) continue

      const lookup = book.value(playerId)
      // An unknown value is not a zero-value player — it is a player this
      // league's source cannot price, and guessing would put them last.
      if (!lookup.known) continue

      const { multiplier, reason } = this.weightFor(position, prefs.preset, counts)
      const liked = prefs.likes.has(playerId)
      const disliked = prefs.dislikes.has(playerId)

      candidates.push({
        playerId,
        name: [meta?.first_name, meta?.last_name].filter(Boolean).join(' ') || playerId,
        position,
        value: lookup.value,
        // Likes float to the top and dislikes sink below everyone else, so
        // the user's own read always beats the preset.
        score: disliked ? -1 : lookup.value * multiplier * (liked ? 1000 : 1),
        reason: liked ? 'On your list' : disliked ? 'Buried by you' : reason,
        liked,
      })
    }

    candidates.sort((a, b) => b.score - a.score)
    return candidates.slice(0, limit)
  }

  private weightFor(
    position: string,
    preset: StrategyPreset,
    counts: Record<string, number>,
  ): { multiplier: number; reason: string } {
    if (preset === 'needs') {
      const target = TARGET_COUNTS[position] ?? 0
      const short = Math.max(0, target - (counts[position] ?? 0))
      if (short > 0) {
        return {
          multiplier: 1 + short * NEED_STEP,
          reason: `You need ${position}`,
        }
      }
      return { multiplier: 1, reason: `${position} filled` }
    }

    const weight = PRESET_WEIGHTS[preset][position]
    if (weight) return { multiplier: weight, reason: STRATEGY_LABELS[preset] }

    return { multiplier: 1, reason: 'Best available' }
  }
}
