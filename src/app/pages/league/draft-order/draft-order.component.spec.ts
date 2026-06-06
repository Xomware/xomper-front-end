import { TestBed } from '@angular/core/testing'
import { DraftOrderComponent } from './draft-order.component'
import { LeagueService } from 'src/app/services/league.service'
import { StandingsService } from 'src/app/services/standings.service'
import { PlayerService } from 'src/app/services/player.service'
import { PlayerPointsService } from 'src/app/services/player-points.service'
import { DraftOrderProjectionService } from 'src/app/services/draft-order-projection.service'
import { optimalLineupPoints, seasonHPP } from 'src/app/services/highest-possible-calculator'
import { HttpClientTestingModule } from '@angular/common/http/testing'

// ============================================================
// HighestPossibleCalculator unit tests
// ============================================================

describe('HighestPossibleCalculator', () => {
  // Standard 1QB/2RB/2WR/1TE/1FLEX roster
  const rosterPositions = ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'BN', 'BN', 'BN']
  const playerPositions: Record<string, string> = {
    'qb1':  'QB',
    'rb1':  'RB',
    'rb2':  'RB',
    'rb3':  'RB',
    'wr1':  'WR',
    'wr2':  'WR',
    'wr3':  'WR',
    'te1':  'TE',
    'k1':   'K',
  }

  it('picks the optimal lineup for a simple week', () => {
    // Only fill exactly the required slots — no flex ambiguity
    const playerPoints: Record<string, number> = {
      'qb1':  30,
      'rb1':  20,
      'rb2':  15,
      'wr1':  18,
      'wr2':  12,
      'te1':  10,
      'rb3':   8,  // goes in FLEX
      'k1':    0,  // BN (K not in any active slot)
    }
    // Active slots: QB, RB, RB, WR, WR, TE, FLEX
    // QB=30, RB1=20, RB2=15, WR1=18, WR2=12, TE1=10, FLEX=rb3(8) — k1 ineligible
    const expected = 30 + 20 + 15 + 18 + 12 + 10 + 8  // = 113
    expect(optimalLineupPoints(playerPoints, rosterPositions, playerPositions)).toBe(expected)
  })

  it('places the highest-scoring RB in FLEX over lower-scoring alternatives', () => {
    const playerPoints: Record<string, number> = {
      'qb1':  25,
      'rb1':  30,
      'rb2':  12,
      'rb3':  20,  // should go in FLEX — beats rb2
      'wr1':  15,
      'wr2':  14,
      'te1':   8,
    }
    // QB=25, RB=rb1(30)+rb2(12), WR=wr1(15)+wr2(14), TE=8, FLEX=rb3(20)
    const expected = 25 + 30 + 12 + 15 + 14 + 8 + 20  // = 124
    expect(optimalLineupPoints(playerPoints, rosterPositions, playerPositions)).toBe(expected)
  })

  it('correctly excludes BN/IR/RES/TAXI slots from active lineup', () => {
    const benchOnly = ['BN', 'BN', 'BN', 'IR', 'TAXI']
    const playerPoints = { 'rb1': 100, 'wr1': 90 }
    // No active slots — nothing to assign
    expect(optimalLineupPoints(playerPoints, benchOnly, playerPositions)).toBe(0)
  })

  it('handles missing player positions gracefully (no crash)', () => {
    const playerPoints = { 'unknown_pid': 50, 'rb1': 20, 'wr1': 15 }
    const positions = { 'rb1': 'RB', 'wr1': 'WR' }
    const positions_minimal = ['RB', 'WR', 'BN']
    // unknown_pid has no position — skipped; RB and WR fill slots
    expect(optimalLineupPoints(playerPoints, positions_minimal, positions)).toBe(35)
  })

  it('seasonHPP sums across multiple weeks', () => {
    const weeklyRosterPoints: Record<string, Record<string, number>> = {
      '1-1': { 'qb1': 30, 'rb1': 20, 'rb2': 10, 'wr1': 15, 'wr2': 12, 'te1': 8, 'rb3': 5 },
      '2-1': { 'qb1': 25, 'rb1': 18, 'rb2': 14, 'wr1': 22, 'wr2': 11, 'te1': 9, 'rb3': 6 },
      '3-1': {},  // empty week — should be skipped
    }

    const week1hpp = optimalLineupPoints(weeklyRosterPoints['1-1'], rosterPositions, playerPositions)
    const week2hpp = optimalLineupPoints(weeklyRosterPoints['2-1'], rosterPositions, playerPositions)

    const total = seasonHPP(1, rosterPositions, weeklyRosterPoints, playerPositions, 3)
    expect(total).toBeCloseTo(week1hpp + week2hpp, 5)
  })

  it('SUPER_FLEX prefers QB over RB/WR when QB scores highest', () => {
    const sfPositions = ['QB', 'RB', 'WR', 'SUPER_FLEX', 'BN']
    const sfPlayerPositions = { 'qb1': 'QB', 'qb2': 'QB', 'rb1': 'RB', 'wr1': 'WR' }
    const playerPoints = { 'qb1': 40, 'qb2': 35, 'rb1': 20, 'wr1': 15 }
    // QB slot=qb1(40), RB=rb1(20), WR=wr1(15), SUPER_FLEX=qb2(35) — qb2 > rb1/wr1 leftovers
    const expected = 40 + 20 + 15 + 35  // = 110
    expect(optimalLineupPoints(playerPoints, sfPositions, sfPlayerPositions)).toBe(expected)
  })
})

// ============================================================
// DraftOrderComponent smoke test
// ============================================================

describe('DraftOrderComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DraftOrderComponent, HttpClientTestingModule],
      providers: [
        LeagueService,
        StandingsService,
        PlayerService,
        PlayerPointsService,
        DraftOrderProjectionService,
      ],
    }).compileComponents()
  })

  it('should create', () => {
    const fixture = TestBed.createComponent(DraftOrderComponent)
    const component = fixture.componentInstance
    expect(component).toBeTruthy()
  })
})
