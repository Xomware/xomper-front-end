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
export function adpFormatFor(
  settings: DraftSettings | null | undefined,
  scoring: Record<string, number> | null | undefined,
): AdpFormat | null {
  if (!settings) return null

  if ((scoring?.['bonus_rec_te'] ?? 0) > 0) return null

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
