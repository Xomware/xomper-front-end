import { Component, OnInit } from '@angular/core'
import { ActivatedRoute, Router, RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router'
import { switchMap, take } from 'rxjs'
import { LeagueService } from 'src/app/services/league.service'
import { LeagueHistoryService } from 'src/app/services/league-history.service'
import { ToastService } from 'src/app/services/toast.service'
import { LoaderComponent } from '../../components/loader/loader.component'
import { NgIf, NgFor, NgClass } from '@angular/common'
import { getCurrentSeason } from 'src/app/constants/season'
import { AiReviewService } from 'src/app/services/ai-review.service'

type SubTab = 'picks' | 'recap'

@Component({
  selector: 'app-draft-history',
  templateUrl: './draft-history.component.html',
  styleUrls: ['./draft-history.component.scss'],
  standalone: true,
  imports: [LoaderComponent, NgIf, NgFor, NgClass, RouterOutlet, RouterLink, RouterLinkActive],
})
export class DraftHistoryComponent implements OnInit {
  loading = false
  leagueName = ''
  leagueId = ''

  availableSeasons: string[] = []
  selectedYear = ''
  readonly currentSeason = getCurrentSeason()

  /** Whether a post-draft report exists to open at all. */
  hasRecap = false

  constructor(
    private aiReviewService: AiReviewService,
    private leagueService: LeagueService,
    private historyService: LeagueHistoryService,
    private toastService: ToastService,
    private router: Router,
    private route: ActivatedRoute,
  ) {}

  ngOnInit(): void {
    // getActiveLeagueId, not getMyLeague: the latter is whichever league
    // loaded first, so on any other league this bounced to /home with
    // "No league loaded" -- which is why history failed for some leagues.
    const leagueId = this.leagueService.getActiveLeagueId()
    if (!leagueId) {
      this.toastService.showNegativeToast('No league selected')
      this.router.navigate(['/home'])
      return
    }

    this.leagueId = leagueId
    this.leagueName =
      this.leagueService.getCurrentLeague()?.name ??
      this.leagueService.getMyLeague()?.getDisplayName() ??
      'League' 

    // Sync selected year from route :year param
    const yearParam = this.route.snapshot.paramMap.get('year')
    if (yearParam) {
      this.selectedYear = yearParam
    }

    // Subscribe to route param changes so year switcher stays in sync on navigation
    this.route.params.subscribe(params => {
      if (params['year']) {
        this.selectedYear = params['year']
      }
    })

    this.loadSeasons()
    this.checkForRecap()
  }

  /**
   * Does a post-draft report exist at all?
   *
   * Asked once for the whole shell rather than per year: the tab bar has to
   * be right before the child route loads, and a tab that opens on an empty
   * page is worse than no tab.
   */
  private checkForRecap(): void {
    this.aiReviewService
      .list({ type: 'postDraft', limit: 1 })
      .pipe(take(1))
      .subscribe({
        next: (result) => (this.hasRecap = result.rows.length > 0),
        // Unreachable reports are indistinguishable from none, and offering
        // a tab that errors is the thing being fixed.
        error: () => (this.hasRecap = false),
      })
  }

  loadSeasons(): void {
    this.loading = true

    this.leagueService.getLeagueChain(this.leagueId).pipe(
      switchMap(chain => this.historyService.getDraftHistoryFromChain(chain)),
      take(1),
    ).subscribe({
      next: (drafts) => {
        this.availableSeasons = [...new Set(drafts.map(d => d.season))]
          .sort((a, b) => parseInt(b) - parseInt(a))

        if (this.availableSeasons.length > 0) {
          // If no year selected yet (root /draft-history), navigate to current season default
          if (!this.selectedYear) {
            const defaultYear = this.availableSeasons[0]
            const defaultSubTab = this.defaultSubTab()
            this.router.navigate(['/draft-history', defaultYear, defaultSubTab], { replaceUrl: true })
          } else if (!this.availableSeasons.includes(this.selectedYear)) {
            // Requested year not in list — fall back to most recent
            const fallback = this.availableSeasons[0]
            this.selectedYear = fallback
            this.router.navigate(['/draft-history', fallback, this.defaultSubTab()], { replaceUrl: true })
          }
        }

        this.loading = false
      },
      error: () => {
        this.toastService.showNegativeToast('Error loading draft history')
        this.loading = false
      },
    })
  }

  defaultSubTab(): SubTab {
    return 'picks'
  }

  isCurrentSeason(year: string): boolean {
    return year === this.currentSeason
  }

  selectYear(year: string): void {
    this.selectedYear = year
    const subTab = this.defaultSubTab()
    this.router.navigate(['/draft-history', year, subTab])
  }

  /**
   * Picks always; recap only when one was actually written.
   *
   * Recap reads an AI report produced by a scheduled job that only ever ran
   * for one league, so for every other league the tab opened on nothing.
   * Mocks is gone entirely: `mock` was a declared report type that nothing
   * has ever written, so that tab was empty for everybody including the
   * league the jobs did run for.
   */
  subTabsForYear(_year: string): SubTab[] {
    return this.hasRecap ? ['picks', 'recap'] : ['picks']
  }

  subTabLabel(tab: SubTab): string {
    const labels: Record<SubTab, string> = {
      picks: 'Picks',
      recap: 'Recap',
    }
    return labels[tab]
  }
}
