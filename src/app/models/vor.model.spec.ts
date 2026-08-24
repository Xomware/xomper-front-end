/**
 * Unit tests for value-over-replacement.
 *
 * These encode the properties that make league settings actually matter:
 * superflex makes quarterbacks scarce, team count moves the replacement
 * line, and a position nobody starts carries no trade value.
 */
import { ProjectedPlayer, ValuedPosition } from './projections.model'
import {
  ScoredPlayer,
  replacementLevels,
  startersByPosition,
  valuesFromVor,
} from './vor.model'

function scored(position: ValuedPosition, points: number, id: string): ScoredPlayer {
  const player: ProjectedPlayer = {
    playerId: id, position, name: id, team: null, stats: {},
  }
  return { player, position, points }
}

/** N players at a position, descending from `top` in steps of `step`. */
function pool(
  position: ValuedPosition,
  count: number,
  top: number,
  step = 10,
): ScoredPlayer[] {
  return Array.from({ length: count }, (_, i) =>
    scored(position, top - i * step, `${position}${i + 1}`),
  )
}

describe('startersByPosition', () => {
  const players = [...pool('QB', 40, 400), ...pool('RB', 60, 300), ...pool('WR', 80, 300), ...pool('TE', 30, 200)]

  it('counts dedicated slots as slots x teams', () => {
    const counts = startersByPosition(['QB', 'RB', 'WR', 'TE', 'BN'], 12, players)
    expect(counts.QB).toBe(12)
    expect(counts.RB).toBe(12)
  })

  it('ignores bench slots', () => {
    const counts = startersByPosition(['QB', 'BN', 'BN', 'BN'], 10, players)
    expect(counts.QB).toBe(10)
    expect(counts.RB).toBe(0)
  })

  it('scales with team count', () => {
    const ten = startersByPosition(['QB'], 10, players)
    const fourteen = startersByPosition(['QB'], 14, players)
    expect(fourteen.QB - ten.QB).toBe(4)
  })

  it('sends superflex slots to quarterbacks once skill slots are filled', () => {
    // Uses a realistic lineup: the dedicated RB/WR/TE and FLEX slots consume
    // the top of those pools first, so the marginal superflex player is the
    // 13th QB rather than the best remaining back. This is what makes
    // superflex QB-scarce, and it only emerges from a full lineup — with a
    // lone QB slot the untouched RB pool would win instead.
    const counts = startersByPosition(
      ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'FLEX', 'SUPER_FLEX', 'BN'],
      12,
      players,
    )
    expect(counts.QB).toBe(24)
  })

  it('leaves quarterbacks scarce-but-singular in a 1QB league', () => {
    const counts = startersByPosition(
      ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'FLEX', 'BN'],
      12,
      players,
    )
    expect(counts.QB).toBe(12)
  })

  it('distributes plain FLEX across RB/WR/TE and never to QB', () => {
    const counts = startersByPosition(['QB', 'RB', 'WR', 'FLEX'], 12, players)
    expect(counts.QB).toBe(12)
    expect(counts.RB + counts.WR + counts.TE).toBe(12 + 12 + 12)
  })

  it('does not count positions with no slot', () => {
    const counts = startersByPosition(['QB', 'RB', 'WR', 'TE'], 12, players)
    expect(counts.K).toBe(0)
    expect(counts.DEF).toBe(0)
  })
})

describe('replacementLevels', () => {
  it('uses the best player who misses a starting job', () => {
    const players = pool('RB', 30, 300) // RB1=300, RB2=290, ...
    const levels = replacementLevels(players, {
      QB: 0, RB: 12, WR: 0, TE: 0, K: 0, DEF: 0,
    })
    // index 12 (0-based) is the 13th back — the first who doesn't start.
    expect(levels.RB).toBe(300 - 12 * 10)
  })

  it('moves the replacement line up as the league gets bigger', () => {
    const players = pool('RB', 40, 300)
    const small = replacementLevels(players, { QB: 0, RB: 10, WR: 0, TE: 0, K: 0, DEF: 0 })
    const large = replacementLevels(players, { QB: 0, RB: 14, WR: 0, TE: 0, K: 0, DEF: 0 })
    expect(large.RB!).toBeLessThan(small.RB!)
  })

  it('treats an unstarted position as entirely replacement level', () => {
    const players = pool('K', 20, 150)
    const levels = replacementLevels(players, { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DEF: 0 })
    // Nobody starts a kicker, so even the best one is replaceable.
    expect(levels.K).toBe(150)
  })

  it('clamps to the last player when the pool is thinner than the league', () => {
    const players = pool('TE', 5, 200)
    const levels = replacementLevels(players, { QB: 0, RB: 0, WR: 0, TE: 12, K: 0, DEF: 0 })
    expect(levels.TE).toBe(200 - 4 * 10)
  })
})

describe('valuesFromVor', () => {
  it('scales the most valuable player to 10000', () => {
    const players = [...pool('RB', 20, 300)]
    const levels = { RB: 200 }
    const values = valuesFromVor(players, levels)
    expect(values.get('RB1')).toBe(10000)
  })

  it('gives below-replacement players a known zero rather than dropping them', () => {
    const players = pool('RB', 20, 300)
    const values = valuesFromVor(players, { RB: 250 })
    // RB20 scores 110, far under the 250 replacement line.
    expect(values.get('RB20')).toBe(0)
    expect(values.has('RB20')).toBe(true)
  })

  it('ranks by margin over replacement, not raw points', () => {
    // A 250-point QB in a shallow QB pool beats a 260-point RB in a deep one.
    const players = [scored('QB', 250, 'qb'), scored('RB', 260, 'rb')]
    const values = valuesFromVor(players, { QB: 100, RB: 240 })
    expect(values.get('qb')!).toBeGreaterThan(values.get('rb')!)
  })

  it('returns all zeros when nobody clears replacement', () => {
    const players = [scored('RB', 100, 'a'), scored('RB', 90, 'b')]
    const values = valuesFromVor(players, { RB: 200 })
    expect(values.get('a')).toBe(0)
    expect(values.get('b')).toBe(0)
  })
})
