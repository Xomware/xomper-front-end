import { Injectable } from '@angular/core'
import { HttpClient } from '@angular/common/http'
import { Observable, catchError, map, of, shareReplay } from 'rxjs'
import { Player } from '../models/player.interface'
import { PlayerModel } from '../models/player.model'
import { environment } from '../../environments/environment'

interface WarehousePlayersResponse {
  count: number
  players: Record<string, Player>
}

@Injectable({
  providedIn: 'root',
})
export class PlayerService {
  private currentPlayer: PlayerModel | null = null
  private baseUrl = 'https://api.sleeper.app/v1'
  private readonly warehouseUrl = `https://${environment.apiId}.execute-api.us-east-1.amazonaws.com/dev`

  // Cached player map - fetched once per session
  private playersCache$: Observable<Record<string, Player>> | null = null

  constructor(private http: HttpClient) {}

  // -------- PLAYER MAP CACHE --------

  /**
   * The player map, from the warehouse where possible.
   *
   * Sleeper's `/players/nfl` is **14.6 MB** and this used to download all of
   * it on every session just to resolve names and positions. The warehouse
   * serves the same map, carrying only the fields this app actually reads, at
   * roughly 758 KB — about 19x smaller.
   *
   * Falls back to Sleeper if the warehouse is unreachable. Without a player
   * map almost every surface breaks: rosters render as ids, position
   * bucketing collapses, and the analyzer has nothing to group by. A slower
   * load is a far better failure than a blank app.
   */
  private loadAllPlayers(): Observable<Record<string, Player>> {
    if (!this.playersCache$) {
      this.playersCache$ = this.http
        .get<WarehousePlayersResponse>(`${this.warehouseUrl}/players/list`)
        .pipe(
          map((response) => response?.players ?? {}),
          catchError(() =>
            this.http.get<Record<string, Player>>(
              `${this.baseUrl}/players/nfl`,
            ),
          ),
          shareReplay(1),
        )
    }
    return this.playersCache$
  }

  // -------- CURRENT PLAYER STATE --------

  setCurrentPlayer(player: Player): void {
    this.currentPlayer = new PlayerModel(player)
  }

  getCurrentPlayer(): PlayerModel | null {
    return this.currentPlayer
  }

  reset(): void {
    this.currentPlayer = null
  }

  // -------- API CALLS --------

  /** Full Sleeper player map, cached per session. */
  getPlayerMap(): Observable<Record<string, Player>> {
    return this.loadAllPlayers()
  }

  getPlayerById(playerId: string): Observable<Player> {
    return this.loadAllPlayers().pipe(
      map(players => players[playerId])
    )
  }

  searchPlayers(query: string): Observable<PlayerModel[]> {
    if (!query?.trim()) return of([])

    return this.loadAllPlayers().pipe(
      map(players => {
        const q = query.toLowerCase().trim()
        return Object.values(players)
          .filter(p =>
            p.search_full_name?.includes(q) ||
            p.first_name?.toLowerCase().includes(q) ||
            p.last_name?.toLowerCase().includes(q)
          )
          .slice(0, 25)
          .map(p => new PlayerModel(p))
      })
    )
  }
}
