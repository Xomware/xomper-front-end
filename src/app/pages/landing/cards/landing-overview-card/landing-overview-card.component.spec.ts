/**
 * A user with no leagues used to be shown four "Jump to" actions that are all
 * league-scoped, so every one dead-ended on "No league selected". Before
 * that, the build-time default handed them the Charlotte Dynasty League
 * instead. This covers the state in between: nothing of their own, and a
 * real next step.
 */
import { ComponentFixture, TestBed } from '@angular/core/testing'
import { By } from '@angular/platform-browser'
import { Router } from '@angular/router'
import { of, throwError } from 'rxjs'
import { LandingOverviewCardComponent } from './landing-overview-card.component'
import { LeagueFollowsService } from 'src/app/services/league-follows.service'
import { LeagueService } from 'src/app/services/league.service'
import { UserProfileService } from 'src/app/services/user-profile.service'

const league = (id: string) => ({
  leagueId: id,
  name: `League ${id}`,
  isFollowed: true,
  isDynasty: true,
  totalRosters: 12,
  status: 'in_season',
})

describe('LandingOverviewCardComponent with no leagues', () => {
  let fixture: ComponentFixture<LandingOverviewCardComponent>
  let navigated: unknown[][]

  const render = async (options: {
    followed?: unknown[]
    loaded?: unknown[]
    loadFails?: boolean
    handle?: string
  } = {}) => {
    const { followed = [], loaded = [], loadFails = false, handle = 'someone' } = options
    navigated = []
    await TestBed.configureTestingModule({
      imports: [LandingOverviewCardComponent],
      providers: [
        {
          provide: LeagueFollowsService,
          useValue: {
            followed,
            selectedLeagueId: null,
            load: () => (loadFails ? throwError(() => new Error('down')) : of(loaded)),
            select: () => undefined,
          },
        },
        { provide: LeagueService, useValue: { clearForLeagueSwitch: () => undefined } },
        { provide: UserProfileService, useValue: { getProfile: () => ({ sleeperUsername: handle }) } },
        { provide: Router, useValue: { navigate: (c: unknown[]) => navigated.push(c) } },
      ],
    }).compileComponents()
    fixture = TestBed.createComponent(LandingOverviewCardComponent)
    fixture.detectChanges()
  }

  const text = () => fixture.nativeElement.textContent as string
  const actionLabels = () =>
    fixture.debugElement.queryAll(By.css('.action-label')).map((e) => e.nativeElement.textContent.trim())

  afterEach(() => TestBed.resetTestingModule())

  it('names the handle it found nothing on', async () => {
    await render({ handle: 'nobody123456' })

    expect(text()).toContain('No leagues yet')
    expect(text()).toContain('nobody123456')
  })

  it('offers only actions that work without a league', async () => {
    await render()

    // Team Analyzer, Trades, Live Draft and Standings all require one.
    expect(actionLabels()).toEqual(['Search', 'Sleeper account'])
  })

  it('shows the league-scoped actions once there is a league', async () => {
    await render({ followed: [league('L1')] })

    expect(text()).not.toContain('No leagues yet')
    expect(actionLabels()).toContain('Team Analyzer')
    expect(actionLabels()).not.toContain('Sleeper account')
  })

  it('does not claim "no leagues" before the list resolves', async () => {
    // The empty state is a statement of fact; making it before the answer
    // arrives is how a loading state gets mistaken for an empty one.
    const component = new LandingOverviewCardComponent(
      { followed: [], load: () => of([]) } as never,
      {} as never,
      { getProfile: () => null } as never,
      { navigate: () => undefined } as never,
    )
    expect(component.resolved).toBe(false)
  })

  it('still resolves when the league list fails to load', async () => {
    await render({ loadFails: true })

    // Stuck at "not resolved" would render neither block: no leagues, and no
    // explanation of why.
    expect(text()).toContain('No leagues yet')
  })

  it('falls back when no Sleeper account is linked', async () => {
    await render({ handle: '' })

    expect(text()).toContain('Link a Sleeper account')
  })
})
