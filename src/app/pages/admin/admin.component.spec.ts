/**
 * "update admin portal to be a chart with tabs. i hate the cards"
 *
 * It was a grid of nine cards filling the screen, so every section was two
 * navigations away: back to the menu, then into the next one.
 */
import { AdminComponent } from './admin.component'

describe('AdminComponent tabs', () => {
  function build(url: string) {
    const router = { navigate: jasmine.createSpy('navigate'), url }
    return { component: new AdminComponent(router as never), router }
  }

  it('offers every section as a tab', () => {
    const { component } = build('/admin')

    expect(component.tabs.length).toBeGreaterThan(1)
    expect(component.tabs.map((t) => t.label)).toContain('Cron Settings')
  })

  it('marks the open section', () => {
    const { component } = build('/admin/cron-settings')
    const cron = component.tabs.find((t) => t.route === '/admin/cron-settings')!
    const audit = component.tabs.find((t) => t.route === '/admin/audit')!

    expect(component.isActive(cron)).toBe(true)
    expect(component.isActive(audit)).toBe(false)
  })

  it('marks a section open from a deeper child route', () => {
    const { component } = build('/admin/email-archive/abc123')
    const archive = component.tabs.find((t) => t.route === '/admin/email-archive')!

    // A detail page is still that section, and the tab should say so.
    expect(component.isActive(archive)).toBe(true)
  })

  it('shows the hint only with nothing open', () => {
    expect(build('/admin').component.atRoot).toBe(true)
    expect(build('/admin/audit').component.atRoot).toBe(false)
  })

  it('does not navigate for a disabled section', () => {
    const { component, router } = build('/admin')
    const logs = component.tabs.find((t) => t.disabled)!

    component.navigate(logs)

    expect(router.navigate).not.toHaveBeenCalled()
  })

  it('never reports a routeless tab as active', () => {
    const { component } = build('/admin')
    const logs = component.tabs.find((t) => !t.route)!

    expect(component.isActive(logs)).toBe(false)
  })
})
