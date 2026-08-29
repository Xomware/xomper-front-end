/**
 * Ranks render as ordinals on the team header. The version this replaces
 * special-cased exactly 1, 2 and 3, and had no case for the -1 the standings
 * model defaults to -- which showed as "BIG10 Standings: -1th" in production.
 */
import { TeamComponent } from './team.component'

describe('TeamComponent.ordinal', () => {
  const ordinal = (rank: number | undefined) =>
    TeamComponent.prototype.ordinal.call({}, rank)

  it('handles the basic suffixes', () => {
    expect(ordinal(1)).toBe('1st')
    expect(ordinal(2)).toBe('2nd')
    expect(ordinal(3)).toBe('3rd')
    expect(ordinal(4)).toBe('4th')
  })

  it('keeps the teens on th', () => {
    // The last-digit rule alone would give 11st, 12nd, 13rd.
    expect(ordinal(11)).toBe('11th')
    expect(ordinal(12)).toBe('12th')
    expect(ordinal(13)).toBe('13th')
  })

  it('applies the last-digit rule past 20', () => {
    // The old inline ternary rendered these as 21th, 22th, 23th.
    expect(ordinal(21)).toBe('21st')
    expect(ordinal(22)).toBe('22nd')
    expect(ordinal(23)).toBe('23rd')
    expect(ordinal(24)).toBe('24th')
    expect(ordinal(111)).toBe('111th')
    expect(ordinal(121)).toBe('121st')
  })

  it('renders nothing for a rank that never resolved', () => {
    // -1 is the standings model default when a division was never computed.
    // The template hides the whole chip on an empty string.
    expect(ordinal(-1)).toBe('')
    expect(ordinal(0)).toBe('')
    expect(ordinal(undefined)).toBe('')
  })
})
