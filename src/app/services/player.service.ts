import { Injectable } from '@angular/core'
import { HttpClient } from '@angular/common/http'
import { Observable, map, of, shareReplay } from 'rxjs'
import { Player } from '../models/player.interface'
import { PlayerModel } from '../models/player.model'

@Injectable({
  providedIn: 'root',
})
export class PlayerService {
  private currentPlayer: PlayerModel | null = null
  private baseUrl = 'https://api.sleeper.app/v1'

  // Cached player map - fetched once per session
  private playersCache$: Observable<Record<string, Player>> | null = null

  constructor(private http: HttpClient) {}

  // -------- PLAYER MAP CACHE --------

  private loadAllPlayers(): Observable<Record<string, Player>> {
    if (!this.playersCache$) {
      this.playersCache$ = this.http
        .get<Record<string, Player>>(`${this.baseUrl}/players/nfl`)
        .pipe(shareReplay(1))
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
