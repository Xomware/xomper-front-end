import { Injectable } from '@angular/core'
import { BehaviorSubject } from 'rxjs'
import { getCurrentSeason } from 'src/app/constants/season'

const SELECTED_SEASON_KEY = 'xomper.selectedSeason'

/**
 * Which season the app is reading.
 *
 * Season sat inside the matchups page as a row of buttons, so it read as a
 * filter belonging to that page rather than a mode the whole app is in --
 * the same thing league selection is. It lives beside the league switcher
 * now, and any page that is season-scoped reads it from here.
 *
 * The available list comes from whichever page resolved the league's season
 * chain; the service does not fetch, so it stays usable from the sidebar
 * without pulling league data into it.
 */
@Injectable({ providedIn: 'root' })
export class SeasonService {
  private readonly availableSubject = new BehaviorSubject<string[]>([])
  private readonly selectedSubject = new BehaviorSubject<string>(
    this.readStored() ?? getCurrentSeason(),
  )

  readonly available$ = this.availableSubject.asObservable()
  readonly selected$ = this.selectedSubject.asObservable()

  get available(): string[] {
    return this.availableSubject.value
  }

  get selected(): string {
    return this.selectedSubject.value
  }

  select(season: string): void {
    if (!season || season === this.selectedSubject.value) return
    this.selectedSubject.next(season)
    this.writeStored(season)
  }

  /**
   * Offer these seasons, newest first.
   *
   * A stored season can outlive the league it came from -- switch to a league
   * that started last year and the remembered 2023 names nothing. Falling
   * back to the newest available beats reading an empty page.
   */
  setAvailable(seasons: string[]): void {
    const sorted = [...new Set(seasons.filter(Boolean))].sort((a, b) => b.localeCompare(a))
    this.availableSubject.next(sorted)

    if (!sorted.length) return
    if (!sorted.includes(this.selectedSubject.value)) {
      this.select(sorted[0])
    }
  }

  /** Back to the current season, for a league switch. */
  reset(): void {
    this.availableSubject.next([])
    this.select(getCurrentSeason())
  }

  private readStored(): string | null {
    try {
      return localStorage.getItem(SELECTED_SEASON_KEY)
    } catch {
      // Private browsing and blocked site data both throw. A missing
      // preference is not worth failing over.
      return null
    }
  }

  private writeStored(season: string): void {
    try {
      localStorage.setItem(SELECTED_SEASON_KEY, season)
    } catch {
      // See readStored.
    }
  }
}
