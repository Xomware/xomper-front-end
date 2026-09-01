import { Injectable } from '@angular/core'
import { HttpClient } from '@angular/common/http'
import { Observable, of } from 'rxjs'
import { catchError, map, shareReplay } from 'rxjs/operators'
import { environment } from 'src/environments/environment'

/**
 * Consensus rankings from several public lists.
 *
 * One list is one opinion. The reason to pull three is `spread` — a player
 * FantasyCalc ranks 107th and ESPN ranks 416th is a decision, and an average
 * alone hides exactly what makes him interesting.
 *
 * Sources are FFC ADP, FantasyCalc and ESPN's published draft ranks. FantasyPros,
 * PFF and DraftSharks are absent because all three are paid products whose terms
 * forbid scraping, not because they were overlooked.
 */

export interface PlayerRanks {
  /** Rank per source, e.g. `{ ffc: 12, espn: 14, fantasycalc: 41 }`. */
  ranks: Record<string, number>
  consensus: number
  /** Population stdev of the ranks. 0 with a single source — see sourceCount. */
  spread: number
  /** How many lists have an opinion. One source is not agreement. */
  sourceCount: number
}

export interface RankingsSnapshot {
  capturedAt: string
  season: string
  sources: string[]
  /** Sources that failed tonight, so the UI can say which rather than imply all ran. */
  failed: Record<string, string>
  count: number
  players: Record<string, PlayerRanks>
}

/** Spread past this is worth surfacing; below it the lists broadly agree. */
export const NOTABLE_SPREAD = 25

@Injectable({ providedIn: 'root' })
export class RankingsService {
  private readonly apiUrl = `https://${environment.apiId}.execute-api.us-east-1.amazonaws.com/dev`
  private cached: Observable<RankingsSnapshot | null> | null = null

  constructor(private http: HttpClient) {}

  /**
   * The current snapshot, cached per session.
   *
   * Failure resolves to null rather than erroring, same rule as ADP: these are
   * context columns on a board that works without them.
   */
  current(): Observable<RankingsSnapshot | null> {
    if (this.cached) return this.cached

    this.cached = this.http.get<RankingsSnapshot>(`${this.apiUrl}/rankings/current`).pipe(
      map((snapshot) => (snapshot?.players ? snapshot : null)),
      catchError(() => of(null)),
      shareReplay(1),
    )
    return this.cached
  }
}

/**
 * How much the lists disagree about a player, as display text.
 *
 * Returns empty when they broadly agree — a "sources agree" badge on every row
 * is noise, and the whole value here is that disagreement stands out.
 */
export function disagreementLabel(row: PlayerRanks | undefined): string {
  if (!row || row.sourceCount < 2) return ''
  if (row.spread < NOTABLE_SPREAD) return ''

  const values = Object.values(row.ranks)
  return `${Math.min(...values)}-${Math.max(...values)}`
}

/** Per-source ranks as ordered pairs, for a tooltip or a detail row. */
export function sourceRows(row: PlayerRanks | undefined): Array<{ source: string; rank: number }> {
  if (!row) return []
  return Object.entries(row.ranks)
    .map(([source, rank]) => ({ source, rank }))
    .sort((a, b) => a.rank - b.rank)
}
