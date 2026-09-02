/**
 * "i feel like the player cards are outdated. can we get some kind of
 * football field line up?"
 *
 * Starters were a grid of identical cards. A lineup reads faster as a shape.
 */
import { TeamComponent } from './team.component'

function player(id: string, position: string) {
  return { player_id: id, position, full_name: `${position} ${id}`, team: 'CHI' }
}

describe('TeamComponent formation', () => {
  const component = Object.create(TeamComponent.prototype) as TeamComponent

  const formationFor = (starters: unknown[]) => {
    ;(component as never as { starters: unknown[] }).starters = starters
    return component.formation
  }

  it('puts quarterbacks and backs in the backfield', () => {
    const rows = formationFor([player('1', 'QB'), player('2', 'RB')])

    expect(rows[0].label).toBe('Backfield')
    expect(rows[0].players.length).toBe(2)
  })

  it('puts receivers and tight ends together', () => {
    const rows = formationFor([player('1', 'WR'), player('2', 'TE')])

    // A FLEX holding a WR should still stand among the receivers, so the
    // rows follow position rather than the league's roster slots.
    expect(rows[0].label).toBe('Receivers')
    expect(rows[0].players.length).toBe(2)
  })

  it('separates kickers and defences', () => {
    const rows = formationFor([player('1', 'QB'), player('2', 'K'), player('3', 'DEF')])

    expect(rows.map((r) => r.label)).toEqual(['Backfield', 'Special'])
    expect(rows[1].players.length).toBe(2)
  })

  it('drops rows nobody is standing in', () => {
    const rows = formationFor([player('1', 'QB')])

    expect(rows.map((r) => r.label)).toEqual(['Backfield'])
  })

  it('never loses a player the rows do not name', () => {
    const rows = formationFor([player('1', 'QB'), player('2', 'LB'), player('3', 'DB')])

    // An IDP league would otherwise lose half its lineup off the field.
    const other = rows.find((r) => r.label === 'Other')
    expect(other?.players.length).toBe(2)
  })

  it('is empty with no starters', () => {
    expect(formationFor([])).toEqual([])
  })
})

describe('TeamComponent view preference', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => localStorage.clear())

  it('remembers the chosen layout', () => {
    const component = Object.create(TeamComponent.prototype) as TeamComponent

    component.setView('list')

    const next = Object.create(TeamComponent.prototype) as TeamComponent
    ;(next as never as { restoreView(): void }).restoreView()
    expect(next.view).toBe('list')
  })

  it('defaults to the field', () => {
    const component = Object.create(TeamComponent.prototype) as TeamComponent
    ;(component as never as { restoreView(): void }).restoreView()

    expect(component.view).toBe('field')
  })

  it('survives blocked storage', () => {
    const original = localStorage.setItem
    localStorage.setItem = () => {
      throw new Error('blocked')
    }
    const component = Object.create(TeamComponent.prototype) as TeamComponent

    expect(() => component.setView('list')).not.toThrow()
    expect(component.view).toBe('list')

    localStorage.setItem = original
  })
})
