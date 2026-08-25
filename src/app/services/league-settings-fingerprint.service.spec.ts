/**
 * Unit tests for LeagueSettingsFingerprintService.
 *
 * This mapper decides which values a league is analyzed against, and its
 * output becomes the warehouse sort key (PLAN.md 3.4), so it is frozen once
 * the warehouse ships. The CLT regression case at the bottom is the important
 * one: it must resolve to the endpoint the app hardcoded before the refactor.
 */
import { LeagueSettingsFingerprintService } from './league-settings-fingerprint.service'
import { League } from '../models/league.interface'

function makeLeague(overrides: Partial<League> = {}): League {
  return {
    league_id: 'test', name: 'Test League', season: '2026', season_type: 'regular',
    sport: 'nfl', status: 'in_season', total_rosters: 12, shard: 1, draft_id: 'd1',
    previous_league_id: null, avatar: null, metadata: null,
    settings: { type: 2 },
    scoring_settings: { rec: 1 },
    roster_positions: ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'SUPER_FLEX', 'BN'],
    ...overrides,
  }
}

describe('LeagueSettingsFingerprintService', () => {
  let service: LeagueSettingsFingerprintService

  beforeEach(() => {
    service = new LeagueSettingsFingerprintService()
  })

  // --- dynasty / keeper / redraft -------------------------------------------

  it('treats type 2 as dynasty', () => {
    expect(service.resolve(makeLeague()).fingerprint.isDynasty).toBe(true)
  })

  it('treats type 0 as redraft', () => {
    const league = makeLeague({ settings: { type: 0 } })
    expect(service.resolve(league).fingerprint.isDynasty).toBe(false)
  })

  it('treats keeper as dynasty-based but labels it an approximation', () => {
    const format = service.resolve(makeLeague({ settings: { type: 1 } }))
    expect(format.fingerprint.isDynasty).toBe(true)
    expect(format.isKeeper).toBe(true)
    expect(format.approximations.length).toBeGreaterThan(0)
  })

  // --- superflex: the dominant axis (~85% value swing) ----------------------

  it('detects superflex from roster_positions', () => {
    expect(service.resolve(makeLeague()).fingerprint.numQbs).toBe(2)
  })

  it('detects 1QB when there is no superflex slot', () => {
    const league = makeLeague({
      roster_positions: ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'BN'],
    })
    expect(service.resolve(league).fingerprint.numQbs).toBe(1)
  })

  it('treats two explicit QB slots as 2QB', () => {
    const league = makeLeague({
      roster_positions: ['QB', 'QB', 'RB', 'WR', 'TE', 'BN'],
    })
    expect(service.resolve(league).fingerprint.numQbs).toBe(2)
  })

  // --- clamping --------------------------------------------------------------

  it('passes a supported team count through unclamped', () => {
    const format = service.resolve(makeLeague({ total_rosters: 14 }))
    expect(format.fingerprint.numTeams).toBe(14)
    expect(format.clamps).toEqual([])
  })

  it('clamps an unsupported team count and records it', () => {
    const format = service.resolve(makeLeague({ total_rosters: 11 }))
    expect(format.fingerprint.numTeams).toBe(10)
    expect(format.clamps).toContain(
      jasmine.objectContaining({ axis: 'numTeams', requested: 11, served: 10 }),
    )
  })

  it('reads half-PPR from scoring_settings', () => {
    const format = service.resolve(makeLeague({ scoring_settings: { rec: 0.5 } }))
    expect(format.fingerprint.ppr).toBe(0.5)
    expect(format.clamps).toEqual([])
  })

  it('treats a missing rec setting as standard scoring', () => {
    const format = service.resolve(makeLeague({ scoring_settings: {} }))
    expect(format.fingerprint.ppr).toBe(0)
  })

  it('clamps an unusual ppr value to the nearest supported one', () => {
    const format = service.resolve(makeLeague({ scoring_settings: { rec: 0.75 } }))
    expect([0.5, 1]).toContain(format.fingerprint.ppr)
    expect(format.clamps.some((c) => c.axis === 'ppr')).toBe(true)
  })

  // --- TE premium: read off the league, not derived -------------------------

  it('surfaces TE premium as an approximation rather than ignoring it', () => {
    const league = makeLeague({ scoring_settings: { rec: 1, bonus_rec_te: 0.5 } })
    const format = service.resolve(league)
    expect(format.teBonus).toBe(0.5)
    expect(format.approximations.some((a) => a.includes('tight end'))).toBe(true)
  })

  it('reports no TE bonus for standard scoring', () => {
    expect(service.resolve(makeLeague()).teBonus).toBe(0)
  })

  // --- hard stops ------------------------------------------------------------

  it('refuses IDP leagues instead of charting a partial roster', () => {
    const league = makeLeague({
      roster_positions: ['QB', 'RB', 'WR', 'TE', 'DL', 'LB', 'DB'],
    })
    const format = service.resolve(league)
    expect(format.unsupportedReasons.length).toBeGreaterThan(0)
    expect(format.unsupportedReasons[0]).toContain('IDP')
  })

  it('refuses best-ball leagues', () => {
    const league = makeLeague({ settings: { type: 2, best_ball: 1 } })
    const format = service.resolve(league)
    expect(format.unsupportedReasons.some((r) => r.includes('Best-ball'))).toBe(true)
  })

  it('supports an ordinary league', () => {
    expect(service.resolve(makeLeague()).unsupportedReasons).toEqual([])
  })

  // --- cache key -------------------------------------------------------------

  it('produces a stable key for the same fingerprint', () => {
    const a = service.resolve(makeLeague())
    const b = service.resolve(makeLeague({ league_id: 'other', name: 'Other' }))
    expect(service.key(a.fingerprint)).toBe(service.key(b.fingerprint))
  })

  it('produces different keys for different formats', () => {
    const sf = service.resolve(makeLeague())
    const oneQb = service.resolve(
      makeLeague({ roster_positions: ['QB', 'RB', 'WR', 'TE', 'FLEX'] }),
    )
    expect(service.key(sf.fingerprint)).not.toBe(service.key(oneQb.fingerprint))
  })

  // --- regression gate (PLAN.md 2.6) ----------------------------------------

  it('resolves CLT to the format the app previously hardcoded', () => {
    // Was: isDynasty=true&numQbs=2&numTeams=12&ppr=1
    const clt = makeLeague({
      total_rosters: 12,
      settings: { type: 2 },
      scoring_settings: { rec: 1, bonus_rec_te: 0.5 },
      roster_positions: ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'SUPER_FLEX', 'BN'],
    })
    const format = service.resolve(clt)
    expect(format.fingerprint).toEqual({
      isDynasty: true, numQbs: 2, numTeams: 12, ppr: 1,
    })
    expect(format.unsupportedReasons).toEqual([])
    // CLT is TE-premium; the old hardcoded endpoint silently approximated it.
    // Now it's stated rather than hidden.
    expect(format.teBonus).toBe(0.5)
  })
})
