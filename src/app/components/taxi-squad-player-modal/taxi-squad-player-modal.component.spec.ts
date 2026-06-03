import { ComponentFixture, TestBed } from '@angular/core/testing'
import { HttpClientTestingModule } from '@angular/common/http/testing'
import { BrowserAnimationsModule } from '@angular/platform-browser/animations'

import { TaxiSquadPlayerModalComponent } from './taxi-squad-player-modal.component'
import { PlayerModel } from 'src/app/models/player.model'
import { TaxiSquadPlayerModel } from 'src/app/models/taxi-squad-player.model'
import { SupabaseService } from 'src/app/services/supabase.service'
import { of } from 'rxjs'

describe('TaxiSquadPlayerModalComponent', () => {
  let component: TaxiSquadPlayerModalComponent
  let fixture: ComponentFixture<TaxiSquadPlayerModalComponent>

  const mockBase = new PlayerModel({
    player_id: '1', first_name: 'Test', last_name: 'Player',
    position: 'RB', team: 'NYG', age: 23, height: 70, weight: '200',
    college: 'Test U', years_exp: 1, number: 22, status: 'Active',
    injury_status: null, fantasy_positions: ['RB'],
    depth_chart_position: 1, depth_chart_order: 1,
    hashtag: '', sport: 'nfl', search_last_name: 'player',
    injury_start_date: null, practice_participation: null,
    sportradar_id: '', fantasy_data_id: 0, search_full_name: 'test player',
    stats_id: '', birth_country: 'US', espn_id: '', search_rank: 1,
    search_first_name: 'test', rotowire_id: null, rotoworld_id: null,
    yahoo_id: null,
  })

  const mockTaxiPlayer = new TaxiSquadPlayerModel(mockBase, {
    rosterId: 1, ownerUserId: 'u1', ownerDisplayName: 'Owner',
    ownerUsername: 'owner1', ownerTeamName: 'Team1', draftRound: 3,
  })

  const mockSupabaseService = {
    getUser: () => null,
    getProfile: () => null,
    isAuthenticated: () => false,
    getClient: () => ({}),
    currentUser$: of(null),
    profile$: of(null),
    initialized$: of(true),
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [HttpClientTestingModule, BrowserAnimationsModule, TaxiSquadPlayerModalComponent],
    providers: [
        { provide: SupabaseService, useValue: mockSupabaseService },
    ],
})
    fixture = TestBed.createComponent(TaxiSquadPlayerModalComponent)
    component = fixture.componentInstance
    component.player = mockTaxiPlayer
    component.startPos = { top: 0, left: 0, width: 100, height: 100 }
    fixture.detectChanges()
  })

  it('should create', () => {
    expect(component).toBeTruthy()
  })
})
