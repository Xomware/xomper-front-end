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
    component.startPos = { top: 0, left: 0, width: 100, height: 100 }
    fixture.detectChanges()
  })

  it('should create', () => {
    expect(component).toBeTruthy()
  })
})
