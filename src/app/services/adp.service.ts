/**
 * ADP for the draft board.
 *
 * Shown as context, never as a prediction. Replaying three completed drafts
 * against ADP found no held-out skill in "will he last until my next pick"
 * (docs/features/fantasy-draft-helper/SPIKE-adp-calibration.md), so the board
 * shows the number and the gap and lets the reader infer. Nothing here returns
 * a probability, and nothing should be added that does.
 */
import { Injectable } from '@angular/core'
import { HttpClient } from '@angular/common/http'
import { Observable, catchError, of, shareReplay } from 'rxjs'
import { environment } from '../../environments/environment'
import { DraftSettings } from '../models/draft.interface'

/** Formats Fantasy Football Calculator actually serves. */
export type AdpFormat = 'standard' | 'ppr' | 'half_ppr' | 'superflex' | 'dynasty' | 'rookie'

export interface AdpPlayer {
  name: string
  position: string
  team: string
  adp: number
  stdev: number
  high: number
  low: number
  times_drafted: number
  bye: number
}

export interface AdpSnapshot {
  format: AdpFormat
  season: string
  capturedAt: string
  sampleStart: string
  sampleEnd: string
  totalDrafts: number
  players: AdpPlayer[]
}

/**
 * Which ADP set fits this league, or null when none does.
 *
 * Null is a real answer. There is no TE-premium ADP upstream at all, and
 * showing PPR numbers under a TE-premium board would be a quiet lie about a
 * format where tight ends move dozens of picks.
 */
/**
 * Whether a league is dynasty or keeper rather than redraft.
 *
 * Mirrors `league-settings-fingerprint.service.ts` exactly, **including its
 * default to dynasty when `type` is absent**. If the two disagree a league gets
 * dynasty values under redraft ADP, which is the original bug wearing a
 * disguise. Sleeper's `settings.type`: 0 redraft, 1 keeper, 2 dynasty.
 */
export function isDynastyLeague(settings: Record<string, unknown> | null | undefined): boolean {
  const raw = settings?.['type']
  const leagueType = typeof raw === 'number' ? raw : 2
  return leagueType !== 0
}

export function adpFormatFor(
  settings: DraftSettings | null | undefined,
  scoring: Record<string, number> | null | undefined,
  isDynasty = false,
): AdpFormat | null {
  if (!settings) return null

  if ((scoring?.['bonus_rec_te'] ?? 0) > 0) return null

  // Dynasty first, because it changes the board more than scoring does. A
  // rookie in a dynasty league goes rounds earlier than his redraft ADP, so
  // serving redraft numbers on a dynasty board is not an approximation — it is
  // the wrong answer for exactly the players the format exists to value.
  //
  // FFC publishes one dynasty set, not a dynasty-by-scoring cross product, so a
  // dynasty league gets it regardless of PPR or superflex. That is a real loss
  // of precision and it beats the alternative of a confidently wrong redraft
  // list. There is no dynasty-superflex set upstream to reach for.
  if (isDynasty) return 'dynasty'

  // Superflex is a second startable QB, whether the slot is named that or not.
  const qbSlots = Number(settings.slots_qb ?? 0)
  if (qbSlots >= 2) return 'superflex'

  const ppr = scoring?.['rec'] ?? 0
  if (ppr >= 0.75) return 'ppr'
  if (ppr >= 0.25) return 'half_ppr'
  return 'standard'
}

@Injectable({ providedIn: 'root' })
export class AdpService {
  private readonly apiUrl = `https://${environment.apiId}.execute-api.us-east-1.amazonaws.com/dev`
  private cache = new Map<AdpFormat, Observable<AdpSnapshot | null>>()

  constructor(private http: HttpClient) {}

  /**
   * One format's snapshot, cached per session.
   *
   * Failure resolves to null rather than erroring. ADP is a column on a board
   * that works without it; losing the whole board because a context column is
   * unreachable would be the wrong trade.
   */
  forFormat(format: AdpFormat): Observable<AdpSnapshot | null> {
    const hit = this.cache.get(format)
    if (hit) return hit

    const request = this.http
      .get<AdpSnapshot>(`${this.apiUrl}/adp/current?format=${format}`)
      .pipe(
        catchError(() => of(null)),
        shareReplay(1),
      )
    this.cache.set(format, request)
    return request
  }
}

/**
 * ADP keyed by normalized name, since FFC publishes no Sleeper id.
 *
 * Position is part of the key: two players share a name often enough that a
 * name-only map silently gives one of them the other's ADP.
 */
export function adpByName(snapshot: AdpSnapshot | null): Map<string, AdpPlayer> {
  const map = new Map<string, AdpPlayer>()
  for (const player of snapshot?.players ?? []) {
    map.set(adpKey(player.name, player.position), player)
  }
  return map
}

export function adpKey(name: string, position: string | undefined): string {
  const cleaned = (name || '')
    .toLowerCase()
    .replace(/[.']/g, '')
    .replace(/-/g, ' ')
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .join(' ')
  return `${cleaned}|${(position || '').toUpperCase()}`
}


export interface LaterCandidate {
  name: string
  position: string
  adp: number
}

/**
 * Board entries whose ADP sits comfortably past the user's next pick.
 *
 * Deliberately ADP and a margin, not a probability. Replaying three real drafts
 * found no held-out skill in predicting whether a player survives to a given
 * pick (docs/features/fantasy-draft-helper/SPIKE-adp-calibration.md), so this
 * reports where players usually go and leaves the inference to the reader.
 *
 * The margin exists because ADP equal to your next pick is a coin flip dressed
 * as information — only a clear gap is worth showing.
 */
export function laterThanNextPick(
  board: Array<{ playerId: string; name: string; position: string }>,
  adpFor: (playerId: string, position: string) => number | null,
  nextPickNo: number | null,
  margin = 6,
  limit = 3,
): LaterCandidate[] {
  if (nextPickNo === null) return []

  const out: LaterCandidate[] = []
  for (const candidate of board) {
    const adp = adpFor(candidate.playerId, candidate.position)
    if (adp === null || adp < nextPickNo + margin) continue
    out.push({ name: candidate.name, position: candidate.position, adp: Math.round(adp) })
    if (out.length >= limit) break
  }
  return out
}
