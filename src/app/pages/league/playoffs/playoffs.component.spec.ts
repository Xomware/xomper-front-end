/**
 * "playoffs needs to be a bracket."
 *
 * The data was already grouped by round; what was missing was a shape that
 * read as a bracket, and round names a person recognises.
 */
import { PlayoffsComponent } from './playoffs.component'

describe('PlayoffsComponent round labels', () => {
  const component = Object.create(PlayoffsComponent.prototype) as PlayoffsComponent
  const label = (round: number, total: number) =>
    (component as never as { labelForRound(r: number, t: number): string }).labelForRound(
      round,
      total,
    )

  it('names rounds from the end backwards', () => {
    // "Round 3" tells a reader nothing; "Final" tells them where they are.
    expect(label(3, 3)).toBe('Final')
    expect(label(2, 3)).toBe('Semifinal')
    expect(label(1, 3)).toBe('Quarterfinal')
  })

  it('works for a two-round bracket', () => {
    expect(label(2, 2)).toBe('Final')
    expect(label(1, 2)).toBe('Semifinal')
  })

  it('falls back to a number when the names run out', () => {
    expect(label(1, 5)).toBe('Round 1')
  })
})

describe('PlayoffsComponent pending slots', () => {
  const component = Object.create(PlayoffsComponent.prototype) as PlayoffsComponent

  it('treats an unfilled slot as pending', () => {
    // Sleeper fills t1/t2 as earlier rounds resolve, so a blank slot mid
    // playoffs is waiting on a winner rather than missing data.
    expect(component.isPending(null)).toBe(true)
    expect(component.isPending(4)).toBe(false)
  })

  it('is empty with no rounds at all', () => {
    component.bracketRounds = []
    component.loserRounds = []

    expect(component.bracketIsEmpty).toBe(true)
  })

  it('is not empty once a bracket exists', () => {
    component.bracketRounds = [{ round: 1, label: 'Final', matches: [] }]
    component.loserRounds = []

    expect(component.bracketIsEmpty).toBe(false)
  })
})

/**
 * "playoffs still doesnt look like bracket"
 *
 * A bracket reads as a tree only when a match sits centred between the two it
 * feeds from. Placement games (3rd, 5th) sat inside the round columns, so the
 * semifinal column held three boxes and nothing lined up.
 */
describe('PlayoffsComponent bracket shape', () => {
  function build(matches: unknown[]) {
    const c = Object.create(PlayoffsComponent.prototype) as PlayoffsComponent
    const group = (c as never as {
      groupBracketByRound(m: unknown[]): { matches: unknown[] }[]
      placementsIn(m: unknown[]): unknown[]
    })
    return {
      rounds: group.groupBracketByRound.call(c, matches),
      placements: group.placementsIn.call(c, matches),
    }
  }

  const advance = (r: number, t1: number, t2: number) => ({ r, t1, t2 })
  const places = (r: number, p: number) => ({ r, p, t1: 1, t2: 2 })

  it('keeps placement games out of the rounds', () => {
    const { rounds } = build([advance(2, 1, 2), advance(2, 3, 4), places(2, 5)])

    // Three boxes in the semifinal column is what broke the alignment.
    expect(rounds[0].matches.length).toBe(2)
  })

  it('collects them separately', () => {
    const { placements } = build([advance(2, 1, 2), places(2, 5), places(3, 3)])

    expect(placements.length).toBe(2)
  })

  it('orders placements by the place they settle', () => {
    const { placements } = build([places(3, 5), places(3, 3)])

    expect(placements.map((m) => (m as { p: number }).p)).toEqual([3, 5])
  })

  it('keeps the championship in the bracket', () => {
    const { rounds, placements } = build([places(3, 1)])

    // p === 1 is the final itself, not a consolation game.
    expect(rounds.length).toBe(1)
    expect(placements).toEqual([])
  })

  it('leaves a bracket with no placement games alone', () => {
    const { rounds, placements } = build([advance(1, 1, 2), advance(1, 3, 4), advance(2, 1, 3)])

    expect(rounds.length).toBe(2)
    expect(rounds[0].matches.length).toBe(2)
    expect(placements).toEqual([])
  })

  it('produces a halving tree', () => {
    const { rounds } = build([
      advance(1, 1, 2), advance(1, 3, 4), advance(1, 5, 6), advance(1, 7, 8),
      advance(2, 1, 3), advance(2, 5, 7),
      advance(3, 1, 5),
    ])

    expect(rounds.map((r) => r.matches.length)).toEqual([4, 2, 1])
  })
})
