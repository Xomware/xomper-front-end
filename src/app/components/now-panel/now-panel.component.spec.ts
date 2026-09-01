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
  it('keeps the pick number while on the clock', () => {
    // Both, always. "On the clock" alone leaves you counting rounds by hand.
    const p = panel({ myTurn: true, nextPickNo: 48, picksAway: 0 })
    expect(p.timing).toBe('On the clock · #48')
  })

  it('calls out the very next pick', () => {
    expect(panel({ nextPickNo: 40, picksAway: 1 }).timing).toBe('You pick next · #40')
  })

  it('counts picks away otherwise', () => {
    expect(panel({ nextPickNo: 52, picksAway: 5 }).timing).toBe('5 picks away · #52')
  })

  it('still shows the number when the gap is unknown', () => {
    expect(panel({ nextPickNo: 52, picksAway: null }).timing).toBe('Your pick #52')
  })

  it('falls back to on the clock with no number at all', () => {
    expect(panel({ myTurn: true, nextPickNo: null }).timing).toBe('On the clock')
  })

  it('says nothing when there is neither', () => {
    expect(panel({ nextPickNo: null, picksAway: null }).timing).toBe('')
  })
})


describe('top pick risk', () => {
  const base = { board: [candidate('Bijan')], nextPickNo: 65, picksAway: 25 }

  it('is silent when the player should last', () => {
    // Saying "should last" invites waiting, which is the advice a wrong number
    // makes expensive. Only surface risk.
    expect(panel({ ...base, topSurvival: 0.9 }).topRisk).toBe('')
  })

  it('warns when he probably will not', () => {
    expect(panel({ ...base, topSurvival: 0.1 }).topRisk).toBe('gone by #65')
  })

  it('says coin flip in the middle', () => {
    expect(panel({ ...base, topSurvival: 0.45 }).topRisk).toBe('coin flip by #65')
  })

  it('is silent with no prediction', () => {
    expect(panel({ ...base, topSurvival: null }).topRisk).toBe('')
  })

  it('is silent on your own clock', () => {
    // The question is not whether he lasts; you are picking now.
    expect(panel({ ...base, myTurn: true, topSurvival: 0.1 }).topRisk).toBe('')
  })
})
