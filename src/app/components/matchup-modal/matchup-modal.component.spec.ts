import { ComponentFixture, TestBed } from '@angular/core/testing'
import { HttpClientTestingModule } from '@angular/common/http/testing'
import { BrowserAnimationsModule } from '@angular/platform-browser/animations'

import { MatchupModalComponent } from './matchup-modal.component'

describe('MatchupModalComponent', () => {
  let component: MatchupModalComponent
  let fixture: ComponentFixture<MatchupModalComponent>

  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [HttpClientTestingModule, BrowserAnimationsModule, MatchupModalComponent],
})
    fixture = TestBed.createComponent(MatchupModalComponent)
    component = fixture.componentInstance
    component.matchupDetail = {
      teamA: {
        teamName: 'Team A', userName: 'userA', avatar: '', wins: 0, losses: 0,
        totalPoints: 0, rosterId: 1, starters: [], players: [], startersPoints: [], playersPoints: {},
      },
      teamB: {
        teamName: 'Team B', userName: 'userB', avatar: '', wins: 0, losses: 0,
        totalPoints: 0, rosterId: 2, starters: [], players: [], startersPoints: [], playersPoints: {},
      },
      week: 1, season: '2025', leagueId: '123', status: 'Complete',
    }
    fixture.detectChanges()
  })

  it('should create', () => {
    expect(component).toBeTruthy()
  })
})

/**
 * Reported live: the modal "opens below where im viewing".
 *
 * The zoom animation set top/left/width/height on the component HOST via
 * @HostBinding, but the fixed positioning lives on the panel inside it. The
 * host was an undecorated element in normal document flow, so the modal
 * rendered wherever it happened to sit in the page.
 */
describe('MatchupModalComponent positioning', () => {
  it('does not take a start position any more', () => {
    // Passing card coordinates was the bug: they landed on the wrong element.
    expect('startPos' in MatchupModalComponent.prototype).toBe(false)
  })

  it('leaves positioning to CSS rather than an animated host', () => {
    expect(
      Object.getOwnPropertyDescriptor(MatchupModalComponent.prototype, 'zoom'),
    ).toBeUndefined()
  })
})

describe('MatchupModalComponent player links', () => {
  function build() {
    const router = { navigate: jasmine.createSpy('navigate') }
    const component = new MatchupModalComponent({} as never, router as never)
    const closed = jasmine.createSpy('closed')
    component.close.subscribe(closed)
    return { component, router, closed }
  }

  it('opens the player page', () => {
    const { component, router } = build()

    component.openPlayer({ player_id: 'p1' } as never)

    expect(router.navigate).toHaveBeenCalledWith(['/player', 'p1'])
  })

  it('closes before navigating', () => {
    const { component, closed } = build()

    component.openPlayer({ player_id: 'p1' } as never)

    // Leaving the dialog stacked means returning to one the reader never
    // opened.
    expect(closed).toHaveBeenCalled()
  })

  it('ignores a player with no id', () => {
    const { component, router, closed } = build()

    component.openPlayer({} as never)

    expect(router.navigate).not.toHaveBeenCalled()
    expect(closed).not.toHaveBeenCalled()
  })
})
