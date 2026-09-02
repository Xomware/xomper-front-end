/**
 * "leageu page should have more stuff on overview of league more stats. the
 * power ranking scan be one sub section/tab on that page"
 *
 * The summary is built from the rosters, users and value book the power
 * rankings already fetch, so the extra depth costs no extra requests.
 */
import { LeagueOverviewComponent } from './league-overview.component'

function team(name: string, qb: number, rb: number, wr: number, te: number, bench = 0) {
  return {
    teamName: name,
    rosterId: 1,
    userId: 'u',
    qbValue: qb,
    rbValue: rb,
    wrValue: wr,
    teValue: te,
    benchValue: bench,
    // totalValue() sums taxi too; leaving it off made every total NaN.
    taxiValue: 0,
  }
}

describe('LeagueOverviewComponent summary', () => {
  const component = Object.create(LeagueOverviewComponent.prototype) as LeagueOverviewComponent
  const summarise = (analyses: unknown[]) =>
    (component as never as { summarise(a: unknown[]): unknown }).summarise(analyses) as {
      teams: number
      averageValue: number
      spread: number
      strongest: { team: string; position: string }
      deepest: { team: string; bench: number }
      positionShare: Array<{ position: string; share: number }>
    } | null

  it('is null with no teams', () => {
    expect(summarise([])).toBeNull()
  })

  it('counts teams and averages roster value', () => {
    const s = summarise([team('A', 10, 10, 10, 10), team('B', 0, 0, 0, 0)])!

    expect(s.teams).toBe(2)
    expect(s.averageValue).toBe(20)
  })

  it('reports the gap between the best and worst roster', () => {
    const s = summarise([team('A', 30, 30, 30, 30), team('B', 10, 10, 10, 10)])!

    // A league at 1.2 is close; at 3 it is not, and that is worth saying.
    expect(s.spread).toBe(3)
  })

  it('does not divide by a roster worth nothing', () => {
    const s = summarise([team('A', 10, 0, 0, 0), team('B', 0, 0, 0, 0)])!

    expect(s.spread).toBe(0)
  })

  it('names the strongest roster and what carries it', () => {
    const s = summarise([team('Weak', 1, 1, 1, 1), team('Strong', 5, 40, 5, 5)])!

    expect(s.strongest.team).toBe('Strong')
    expect(s.strongest.position).toBe('RB')
  })

  it('names the deepest bench', () => {
    const s = summarise([team('A', 10, 0, 0, 0, 5), team('B', 10, 0, 0, 0, 50)])!

    expect(s.deepest.team).toBe('B')
    expect(s.deepest.bench).toBe(50)
  })

  it('splits starter value across positions', () => {
    const s = summarise([team('A', 25, 25, 25, 25)])!
    const byPosition = Object.fromEntries(s.positionShare.map((p) => [p.position, p.share]))

    expect(byPosition['QB']).toBeCloseTo(0.25, 5)
    expect(s.positionShare.reduce((sum, p) => sum + p.share, 0)).toBeCloseTo(1, 5)
  })

  it('reports zero shares rather than dividing by nothing', () => {
    const s = summarise([team('A', 0, 0, 0, 0)])!

    expect(s.positionShare.every((p) => p.share === 0)).toBe(true)
  })
})
