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
