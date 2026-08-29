/**
 * Tests for mark-off persistence.
 *
 * A draft lives entirely in localStorage — there is no server copy — so a bad
 * restore is unrecoverable and silent. Restoring a malformed value would put
 * every later pick on the wrong team; throwing on a corrupt one would lock the
 * user out of the page with no way back short of clearing site data.
 */
import { ManualDraftComponent } from './manual-draft.component'
import { ManualDraft, emptyManualDraft } from 'src/app/services/manual-draft.service'

const KEY = 'xomper.manualDraft'

interface Probe {
  draft: ManualDraft
  persist(): void
  restore(): ManualDraft | null
  applySetup(): void
}

/** Exercises the private persistence pair without standing up the DI graph. */
function probe(): Probe {
  return Object.create(ManualDraftComponent.prototype) as unknown as Probe
}

describe('ManualDraftComponent persistence', () => {
  beforeEach(() => localStorage.removeItem(KEY))
  afterEach(() => localStorage.removeItem(KEY))

  it('returns null when nothing is stored', () => {
    expect(probe().restore()).toBeNull()
  })

  it('round-trips a draft', () => {
    const c = probe()
    c.draft = { ...emptyManualDraft(10, 16, 4), picks: ['a', 'b'] }
    c.persist()

    expect(c.restore()).toEqual(c.draft)
  })

  it('discards corrupt JSON and clears it', () => {
    localStorage.setItem(KEY, '{not json')

    expect(probe().restore()).toBeNull()
    // Left in place it would throw on every subsequent load.
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it('rejects a value that is not a draft', () => {
    localStorage.setItem(KEY, JSON.stringify({ hello: 'world' }))
    expect(probe().restore()).toBeNull()
  })

  it('rejects a draft with no picks array', () => {
    localStorage.setItem(KEY, JSON.stringify({ teams: 12, rounds: 15 }))
    expect(probe().restore()).toBeNull()
  })

  it('rejects a draft with no team count', () => {
    // Without teams every slot calculation is NaN.
    localStorage.setItem(KEY, JSON.stringify({ picks: [], rounds: 15 }))
    expect(probe().restore()).toBeNull()
  })
})

describe('ManualDraftComponent setup coercion', () => {
  it('replaces a blank number input with a usable default', () => {
    const c = probe()
    // An emptied number input binds to null, which would NaN every slot.
    c.draft = { ...emptyManualDraft(), teams: null as never, rounds: null as never }
    c.applySetup()

    expect(c.draft.teams).toBe(12)
    expect(c.draft.rounds).toBe(15)
    expect(c.draft.mySlot).toBe(1)
  })
})
