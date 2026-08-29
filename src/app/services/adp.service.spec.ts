/**
 * Tests for ADP format selection and name keying.
 *
 * ADP is context, not prediction. The two ways it can quietly mislead are
 * picking the wrong format for a league, and giving a player someone else's
 * number through a sloppy name match. Both are pinned here.
 */
import { adpFormatFor, adpByName, adpKey, AdpSnapshot } from './adp.service'
import { DraftSettings } from '../models/draft.interface'

function settings(over: Partial<DraftSettings> = {}): DraftSettings {
  return {
    teams: 12,
    slots_qb: 1,
    slots_rb: 2,
    slots_wr: 2,
    slots_te: 1,
    slots_k: 1,
    slots_def: 1,
    slots_flex: 1,
    slots_bn: 6,
    rounds: 15,
    pick_timer: 0,
    ...over,
  } as DraftSettings
}

describe('adpFormatFor', () => {
  it('picks full PPR at 1.0', () => {
    expect(adpFormatFor(settings(), { rec: 1 })).toBe('ppr')
  })

  it('picks half PPR at 0.5', () => {
    expect(adpFormatFor(settings(), { rec: 0.5 })).toBe('half_ppr')
  })

  it('picks standard with no reception scoring', () => {
    expect(adpFormatFor(settings(), { rec: 0 })).toBe('standard')
    expect(adpFormatFor(settings(), {})).toBe('standard')
  })

  it('picks superflex when a second QB can start', () => {
    expect(adpFormatFor(settings({ slots_qb: 2 }), { rec: 1 })).toBe('superflex')
  })

  it('returns null for TE premium', () => {
    // FFC publishes no TE-premium ADP. Showing PPR under a TE-prem board
    // would misprice the position the format exists to change.
    expect(adpFormatFor(settings(), { rec: 1, bonus_rec_te: 0.5 })).toBeNull()
  })

  it('returns null without settings', () => {
    expect(adpFormatFor(null, { rec: 1 })).toBeNull()
  })
})

describe('adpKey', () => {
  it('normalizes punctuation and suffixes', () => {
    expect(adpKey("A.J. O'Neill-Smith Jr.", 'WR')).toBe('aj oneill smith|WR')
  })

  it('separates two players sharing a name', () => {
    expect(adpKey('Mike Williams', 'WR')).not.toBe(adpKey('Mike Williams', 'TE'))
  })

  it('handles empty input', () => {
    expect(adpKey('', undefined)).toBe('|')
  })
})

describe('adpByName', () => {
  const snapshot = {
    players: [
      { name: "Ja'Marr Chase", position: 'WR', adp: 1.5, stdev: 0.8 },
      { name: 'Mike Williams', position: 'TE', adp: 90, stdev: 12 },
      { name: 'Mike Williams', position: 'WR', adp: 60, stdev: 10 },
    ],
  } as AdpSnapshot

  it('keys on normalized name and position', () => {
    const map = adpByName(snapshot)
    expect(map.get(adpKey("JaMarr Chase", 'WR'))?.adp).toBe(1.5)
  })

  it('keeps same-named players apart', () => {
    const map = adpByName(snapshot)
    expect(map.get(adpKey('Mike Williams', 'TE'))?.adp).toBe(90)
    expect(map.get(adpKey('Mike Williams', 'WR'))?.adp).toBe(60)
  })

  it('is empty for a null snapshot', () => {
    expect(adpByName(null).size).toBe(0)
  })
})
