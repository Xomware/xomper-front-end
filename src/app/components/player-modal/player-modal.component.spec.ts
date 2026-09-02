import { ComponentFixture, TestBed } from '@angular/core/testing'
import { BrowserAnimationsModule } from '@angular/platform-browser/animations'

import { PlayerModalComponent } from './player-modal.component'
import { PlayerModel } from 'src/app/models/player.model'

describe('PlayerModalComponent', () => {
  let component: PlayerModalComponent
  let fixture: ComponentFixture<PlayerModalComponent>

  const mockPlayer = new PlayerModel({
    player_id: '1', first_name: 'Test', last_name: 'Player',
    position: 'QB', team: 'NYG', age: 25, height: 74, weight: '220',
    college: 'Test U', years_exp: 3, number: 10, status: 'Active',
    injury_status: null, fantasy_positions: ['QB'],
    depth_chart_position: 1, depth_chart_order: 1,
    hashtag: '', sport: 'nfl', search_last_name: 'player',
    injury_start_date: null, practice_participation: null,
    sportradar_id: '', fantasy_data_id: 0, search_full_name: 'test player',
    stats_id: '', birth_country: 'US', espn_id: '', search_rank: 1,
    search_first_name: 'test', rotowire_id: null, rotoworld_id: null,
    yahoo_id: null,
  })

  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [BrowserAnimationsModule, PlayerModalComponent],
})
    fixture = TestBed.createComponent(PlayerModalComponent)
    component = fixture.componentInstance
    component.player = mockPlayer
    fixture.detectChanges()
  })

  it('should create', () => {
    expect(component).toBeTruthy()
  })
})
