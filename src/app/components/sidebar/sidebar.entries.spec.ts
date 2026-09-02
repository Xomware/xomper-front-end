/**
 * Every sidebar link must point at a route that exists.
 *
 * This has broken three times. Deleting CLT-only pages (#132) left the
 * sidebar pointing at World Cup and Taxi Squad, and then at Rulebook,
 * Scoring, League Settings, Payouts and Rule Proposals — all removed routes.
 * Nothing failed: the nav rendered, the link did nothing, and only clicking
 * it in a browser revealed the problem.
 *
 * Comparing the two lists is cheap and catches the whole class.
 */
import { Routes } from '@angular/router'
import { routes } from '../../app-routing.module'
import { SIDEBAR_SECTIONS } from './sidebar.entries'

/** Every concrete path the router can match, as absolute '/a/b' strings. */
function routePaths(config: Routes, prefix = ''): string[] {
  const found: string[] = []
  for (const route of config) {
    if (route.path === undefined || route.path === '**') continue
    const full = route.path ? `${prefix}/${route.path}` : prefix
    if (full) found.push(full)
    if (route.children) found.push(...routePaths(route.children, full))
  }
  return found
}

describe('sidebar entries', () => {
  const known = new Set(routePaths(routes))

  const links = SIDEBAR_SECTIONS.flatMap((section) =>
    section.entries.map((entry) => ({
      label: entry.label,
      route: entry.route,
      section: section.title,
    })),
  )

  it('has links to check', () => {
    expect(links.length).toBeGreaterThan(0)
  })

  it('points every link at a route that exists', () => {
    // Parameterised segments would need matching rather than lookup; none of
    // the sidebar routes use them today, and this asserts that stays true.
    const dead = links.filter((l) => !known.has(l.route))

    expect(dead.map((l) => `${l.section} > ${l.label} -> ${l.route}`)).toEqual([])
  })

  it('uses absolute routes', () => {
    // A relative route resolves against whatever page is showing, so the same
    // link lands somewhere different depending on where it was clicked.
    expect(links.filter((l) => !l.route.startsWith('/'))).toEqual([])
  })
})


describe('draft entries', () => {
  const links = SIDEBAR_SECTIONS.flatMap((s) => s.entries)

  it('keeps mark-off off the main nav', () => {
    // It is the fallback for a draft Sleeper cannot read, surfaced from the
    // live draft that failed to find one -- not a tool competing with it.
    expect(links.find((e) => e.route === '/mark-off')).toBeUndefined()
  })

  it('sends Live Draft to its own page, not into draft history', () => {
    const live = links.find((e) => e.label === 'Live Draft')

    expect(live?.route).toBe('/live-draft')
  })

  it('keeps draft order to admins', () => {
    const order = links.find((e) => e.route === '/league/draft-order')

    // A projected order for a draft that has not happened is useful to an
    // admin setting one up and noise for everyone else.
    expect(order?.adminOnly).toBe(true)
  })
})
