/**
 * Tests for the display name control.
 *
 * This is the name other people see. It stands in for the Sleeper handle
 * precisely because the handle is unverified, so the control has to actually
 * save and reflect what came back rather than optimistically keep the typed
 * value.
 */
import { of, throwError } from 'rxjs'
import { SettingsComponent } from './settings.component'

function profile(displayName = 'Dom', sleeperUsername = 'domgiordano') {
  return {
    userId: 'u1',
    email: 'd@x.com',
    sleeperUserId: '1',
    sleeperUsername,
    sleeperAvatar: '',
    displayName,
    hasLinkedSleeper: true,
    createdAt: '',
    updatedAt: '',
  }
}

function build(options: { current?: unknown; saveFails?: boolean; saveError?: string } = {}) {
  const { current = profile(), saveFails = false, saveError } = options
  const profiles = {
    getProfile: () => current,
    load: () => of(current),
    setDisplayName: jasmine.createSpy('setDisplayName').and.callFake((name: string) =>
      saveFails
        ? throwError(() => ({ error: { error: { message: saveError ?? 'nope' } } }))
        : of(profile(name)),
    ),
  }
  return { component: new SettingsComponent(profiles as never), profiles }
}

describe('SettingsComponent display name', () => {
  it('prefills from the cached profile', () => {
    const { component } = build()

    component.ngOnInit()

    expect(component.displayName).toBe('Dom')
  })

  it('fetches on a cold navigation', () => {
    const { component } = build({ current: profile('') })
    ;(component as unknown as { profiles: { load: () => unknown } }).profiles.load = () =>
      of(profile('Loaded'))

    component.ngOnInit()

    expect(component.displayName).toBe('Loaded')
  })

  it('saves a trimmed name', () => {
    const { component, profiles } = build()
    component.displayName = '  Dominick  '

    component.save()

    expect(profiles.setDisplayName).toHaveBeenCalledWith('Dominick')
    expect(component.saved).toBe(true)
  })

  it('reflects what the server returned, not what was typed', () => {
    const { component } = build()
    component.displayName = '  Dominick  '

    component.save()

    // The API trims and validates; echoing the raw input would drift from
    // what everyone else sees.
    expect(component.displayName).toBe('Dominick')
  })

  it('refuses an empty name without a round trip', () => {
    const { component, profiles } = build()
    component.displayName = '   '

    component.save()

    expect(profiles.setDisplayName).not.toHaveBeenCalled()
    expect(component.error).toBeTruthy()
  })

  it('refuses an over-long name without a round trip', () => {
    const { component, profiles } = build()
    component.displayName = 'x'.repeat(33)

    component.save()

    expect(profiles.setDisplayName).not.toHaveBeenCalled()
    expect(component.error).toContain('32')
  })

  it('surfaces the API message on failure', () => {
    const { component } = build({ saveFails: true, saveError: 'displayName is required' })
    component.displayName = 'Dom'

    component.save()

    expect(component.error).toBe('displayName is required')
    expect(component.saving).toBe(false)
  })

  it('shows the Sleeper handle as a linked account', () => {
    const { component } = build()

    // Displayed as an account you linked, not as who you are.
    expect(component.sleeperUsername).toBe('domgiordano')
  })

  it('clears the saved flag when saving again', () => {
    const { component } = build()
    component.displayName = 'Dom'
    component.save()
    expect(component.saved).toBe(true)

    component.displayName = ''
    component.save()

    expect(component.saved).toBe(false)
  })
})
