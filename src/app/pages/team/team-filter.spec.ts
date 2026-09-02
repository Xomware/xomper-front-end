/**
 * "need quick jumps and filters for teams too"
 *
 * A roster is twenty-odd cards and finding one player meant scrolling all of
 * them.
 */
import { TeamComponent } from './team.component'

function player(name: string, position: string, team = 'CHI') {
  return { player_id: name, full_name: name, position, team }
}

describe('TeamComponent roster filter', () => {
  function build(starters: unknown[] = [], bench: unknown[] = [], taxi: unknown[] = []) {
    const c = Object.create(TeamComponent.prototype) as TeamComponent
    const fields = c as never as Record<string, unknown>
    fields['starters'] = starters
    fields['bench'] = bench
    fields['taxi'] = taxi
    fields['filterText'] = ''
    fields['filterPosition'] = ''
    fields['POSITION_ORDER'] = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF']
    return c
  }

  it('matches on a player name', () => {
    const c = build([player('Caleb Williams', 'QB'), player('Rome Odunze', 'WR')])
    c.filterText = 'caleb'

    expect(c.match(c.starters).map((p) => p.full_name)).toEqual(['Caleb Williams'])
  })

  it('matches on a team, which is as common a question', () => {
    const c = build([player('A', 'QB', 'CHI'), player('B', 'WR', 'GB')])
    c.filterText = 'gb'

    expect(c.match(c.starters).map((p) => p.full_name)).toEqual(['B'])
  })

  it('filters by position', () => {
    const c = build([player('A', 'QB'), player('B', 'WR')])
    c.filterPosition = 'WR'

    expect(c.match(c.starters).map((p) => p.full_name)).toEqual(['B'])
  })

  it('combines text and position', () => {
    const c = build([player('Rome', 'WR'), player('Romeo', 'QB')])
    c.filterText = 'rom'
    c.filterPosition = 'QB'

    expect(c.match(c.starters).map((p) => p.full_name)).toEqual(['Romeo'])
  })

  it('offers only positions on the roster', () => {
    const c = build([player('A', 'QB')], [player('B', 'WR')], [player('C', 'TE')])

    // A chip for a position nobody plays is a filter that always empties the
    // page.
    expect(c.availablePositions).toEqual(['QB', 'WR', 'TE'])
  })

  it('orders position chips the way a lineup reads', () => {
    const c = build([player('A', 'TE'), player('B', 'QB'), player('C', 'RB')])

    expect(c.availablePositions).toEqual(['QB', 'RB', 'TE'])
  })

  it('toggles a position off when picked twice', () => {
    const c = build([player('A', 'QB')])

    c.togglePosition('QB')
    expect(c.filterPosition).toBe('QB')

    c.togglePosition('QB')
    expect(c.filterPosition).toBe('')
  })

  it('knows when nothing matches anywhere', () => {
    const c = build([player('A', 'QB')], [player('B', 'WR')])
    c.filterText = 'nobody'

    expect(c.noMatches).toBe(true)
  })

  it('is not "no matches" when a group still has someone', () => {
    const c = build([player('A', 'QB')], [player('B', 'WR')])
    c.filterPosition = 'WR'

    // Starters is empty here, but the roster still has a match.
    expect(c.noMatches).toBe(false)
  })

  it('reports nothing filtered before anyone types', () => {
    const c = build([player('A', 'QB')])

    expect(c.filtering).toBe(false)
    expect(c.noMatches).toBe(false)
    expect(c.match(c.starters).length).toBe(1)
  })

  it('clears both halves of the filter', () => {
    const c = build([player('A', 'QB')])
    c.filterText = 'a'
    c.filterPosition = 'QB'

    c.clearFilter()

    expect(c.filtering).toBe(false)
  })

  it('ignores surrounding whitespace', () => {
    const c = build([player('Caleb', 'QB')])
    c.filterText = '   '

    expect(c.filtering).toBe(false)
    expect(c.match(c.starters).length).toBe(1)
  })
})
