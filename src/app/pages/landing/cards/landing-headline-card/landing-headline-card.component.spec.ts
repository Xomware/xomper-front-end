/**
 * Tests for the AI headline card.
 *
 * It leads the home page, so whatever it shows reads as current. Through the
 * 2026 preseason it was showing "Week 17 — 2025" — a finished season's final
 * report, presented as news.
 */
import { of, throwError } from 'rxjs'
import { LandingHeadlineCardComponent } from './landing-headline-card.component'
import { getCurrentSeason } from 'src/app/constants/season'

function report(period: string) {
  return {
    leagueId: 'l1',
    reportType: 'weekly',
    period,
    content: 'Something happened.',
  }
}

function build(headline: unknown, fails = false) {
  return new LandingHeadlineCardComponent({
    getHeadline: () => (fails ? throwError(() => new Error('x')) : of(headline)),
  } as never)
}

describe('LandingHeadlineCardComponent', () => {
  const season = getCurrentSeason()

  it('shows a report from the current season', () => {
    const component = build(report(`${season}W3`))

    component.ngOnInit()

    expect(component.report).not.toBeNull()
    expect(component.isLoading).toBe(false)
  })

  it('suppresses a report from a finished season', () => {
    const component = build(report(`${Number(season) - 1}W17`))

    component.ngOnInit()

    // Falls through to the card's own placeholder rather than leading the
    // page with last season's final week.
    expect(component.report).toBeNull()
  })

  it('handles a season-prefixed non-weekly period', () => {
    const component = build(report(`${season}-PRESEASON`))

    component.ngOnInit()

    expect(component.report).not.toBeNull()
  })

  it('keeps a report whose period it cannot parse', () => {
    const component = build(report('SOMETHING-ELSE'))

    component.ngOnInit()

    // Losing a real report is worse than showing an odd one.
    expect(component.report).not.toBeNull()
  })

  it('clears on a null headline', () => {
    const component = build(null)

    component.ngOnInit()

    expect(component.report).toBeNull()
    expect(component.isLoading).toBe(false)
  })

  it('stops loading on error', () => {
    const component = build(null, true)

    component.ngOnInit()

    expect(component.report).toBeNull()
    expect(component.isLoading).toBe(false)
  })
})
