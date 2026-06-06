/**
 * Unit tests for player-value model pure helpers.
 * Tests parseYearPrefix and parsePlayerValue — no Angular DI needed.
 */
import { parsePlayerValue, parseYearPrefix, FantasyCalcPlayerRaw } from '../models/player-value.model'

function playerEntry(
  sleeperId: string,
  position: string,
  value: number,
  name: string = 'Test Player',
): FantasyCalcPlayerRaw {
  return { player: { sleeperId, position, name }, value, overallRank: 1, positionRank: 1, trend30Day: 0 }
}

function pickEntry(name: string, value: number): FantasyCalcPlayerRaw {
  return { player: { sleeperId: null, position: 'PICK', name }, value, overallRank: null, positionRank: null, trend30Day: null }
}

// ---------------------------------------------------------------------------
// parseYearPrefix
// ---------------------------------------------------------------------------

describe('parseYearPrefix', () => {
  it('parses a 4-digit leading year', () => {
    expect(parseYearPrefix('2026 Pick 1.01')).toBe(2026)
    expect(parseYearPrefix('2027 1st')).toBe(2027)
    expect(parseYearPrefix('2028 Early 2nd')).toBe(2028)
  })

  it('returns null for empty string', () => {
    expect(parseYearPrefix('')).toBeNull()
  })

  it('returns null for non-numeric prefix', () => {
    expect(parseYearPrefix('abc Pick')).toBeNull()
  })

  it('returns null for strings shorter than 4 chars', () => {
    expect(parseYearPrefix('202')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// parsePlayerValue
// ---------------------------------------------------------------------------

describe('parsePlayerValue', () => {
  it('marks regular players as not picks', () => {
    const pv = parsePlayerValue(playerEntry('4984', 'QB', 10214, 'Josh Allen'))
    expect(pv.isPick).toBe(false)
    expect(pv.sleeperId).toBe('4984')
    expect(pv.value).toBe(10214)
    expect(pv.position).toBe('QB')
    expect(pv.name).toBe('Josh Allen')
  })

  it('marks PICK position entries as picks', () => {
    const pv = parsePlayerValue(pickEntry('2026 Pick 1.01', 6843))
    expect(pv.isPick).toBe(true)
    expect(pv.sleeperId).toBeNull()
    expect(pv.value).toBe(6843)
    expect(pv.name).toBe('2026 Pick 1.01')
  })

  it('marks entries with empty sleeperId as picks', () => {
    const raw: FantasyCalcPlayerRaw = {
      player: { sleeperId: '', position: 'WR', name: 'Ghost Player' },
      value: 500, overallRank: null, positionRank: null, trend30Day: null,
    }
    expect(parsePlayerValue(raw).isPick).toBe(true)
  })

  it('passes through overallRank and positionRank', () => {
    const pv = parsePlayerValue(playerEntry('4984', 'QB', 10214))
    expect(pv.overallRank).toBe(1)
    expect(pv.positionRank).toBe(1)
  })
})
