/**
 * Tests for the second-screen panel.
 *
 * This is what someone reads in the few seconds after switching away from the
 * draft app, so the logic that decides what those seconds are spent on is the
 * product. Everything here is input-driven — no league, no book, no feed.
 */
import { NowPanelComponent } from './now-panel.component'
import { DraftCandidate } from 'src/app/services/draft-assistant.service'

function candidate(name: string, position = 'RB'): DraftCandidate {
  return {
    playerId: name,
    name,
    position,
    value: 100,
    score: 100,
    reason: '',
    liked: false,
  }
}

function panel(over: Partial<NowPanelComponent> = {}): NowPanelComponent {
  return Object.assign(new NowPanelComponent(), over)
}

describe('top and alternates', () => {
  it('has no top on an empty board', () => {
    expect(panel().top).toBeNull()
  })

  it('takes the first candidate as the answer', () => {
    const p = panel({ board: [candidate('Bijan'), candidate('Chase', 'WR')] })
    expect(p.top?.name).toBe('Bijan')
  })

  it('shows exactly two alternates', () => {
    // Three names is already more than a glance affords.
    const board = ['a', 'b', 'c', 'd', 'e'].map((n) => candidate(n))
    expect(panel({ board }).alternates.map((c) => c.name)).toEqual(['b', 'c'])
  })

  it('copes with a board of one', () => {
    expect(panel({ board: [candidate('Bijan')] }).alternates).toEqual([])
  })
})

describe('timing line', () => {
  it('says on the clock when it is your turn', () => {
    // The only moment the pick number stops being what you need to know.
    const p = panel({ myTurn: true, nextPickNo: 52, picksAway: 5 })
    expect(p.timing).toBe('On the clock')
  })

  it('calls out the very next pick', () => {
    expect(panel({ nextPickNo: 40, picksAway: 1 }).timing).toBe('You pick next')
  })

  it('counts picks away otherwise', () => {
    expect(panel({ nextPickNo: 52, picksAway: 5 }).timing).toBe('5 picks away · #52')
  })

  it('says nothing when the next pick is unknown', () => {
    // Better silent than a confident wrong number.
    expect(panel({ nextPickNo: null, picksAway: null }).timing).toBe('')
    expect(panel({ nextPickNo: 52, picksAway: null }).timing).toBe('')
  })
})
