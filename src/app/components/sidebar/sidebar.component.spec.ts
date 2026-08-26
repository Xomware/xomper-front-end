/**
 * Tests for the sidebar's account menu.
 *
 * Sign-out had no home on the signed-in shell: the toolbar has a button, but
 * the shell renders the sidebar, whose profile chip was a plain link to
 * /profile. A signed-in user had no way to sign out.
 */
import { of, throwError } from 'rxjs'
import { SidebarComponent } from './sidebar.component'
import { UserProfile } from '../../services/user-profile.service'

function profile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    userId: 'cog-1',
    email: 'd@x.com',
    sleeperUserId: '594625531702460416',
    sleeperUsername: 'domgiordano',
    sleeperAvatar: '',
    hasLinkedSleeper: true,
    createdAt: '',
    updatedAt: '',
    ...overrides,
  }
}

function build(options: { signOutFails?: boolean; profile?: UserProfile | null } = {}) {
  const profiles = {
    getProfile: () => (options.profile === undefined ? profile() : options.profile),
    clear: jasmine.createSpy('clear'),
  }
  const userService = {
    reset: jasmine.createSpy('reset'),
    buildAvatar: (a: string) => `https://avatars/${a}`,
  }
  const cognito = {
    signOut: () =>
      options.signOutFails ? throwError(() => new Error('no session')) : of(undefined),
  }
  const router = { navigate: jasmine.createSpy('navigate') }

  const component = new SidebarComponent(
    profiles as never,
    userService as never,
    cognito as never,
    router as never,
    { bypassSecurityTrustHtml: (v: string) => v } as never,
  )

  return { component, profiles, userService, router }
}

describe('SidebarComponent account menu', () => {
  it('starts closed', () => {
    expect(build().component.profileMenuOpen).toBe(false)
  })

  it('toggles open and shut', () => {
    const { component } = build()
    const event = { stopPropagation: () => undefined } as Event

    component.toggleProfileMenu(event)
    expect(component.profileMenuOpen).toBe(true)

    component.toggleProfileMenu(event)
    expect(component.profileMenuOpen).toBe(false)
  })

  it('stops the opening click reaching the document listener', () => {
    const { component } = build()
    const stopPropagation = jasmine.createSpy('stopPropagation')

    component.toggleProfileMenu({ stopPropagation } as unknown as Event)

    // Without this the document handler below closes the menu in the same
    // tick it opens, and the dropdown never appears.
    expect(stopPropagation).toHaveBeenCalled()
  })

  it('closes on an outside click', () => {
    const { component } = build()
    component.profileMenuOpen = true

    component.onDocumentClick()

    expect(component.profileMenuOpen).toBe(false)
  })

  it('closes on Escape', () => {
    const { component } = build()
    component.profileMenuOpen = true

    component.onEscape()

    expect(component.profileMenuOpen).toBe(false)
  })

  it('signs out, clears local state and returns to login', () => {
    const { component, profiles, userService, router } = build()

    component.signOut()

    expect(profiles.clear).toHaveBeenCalled()
    // Without the reset the next account inherits the previous myUser and
    // sees someone else's team.
    expect(userService.reset).toHaveBeenCalled()
    expect(router.navigate).toHaveBeenCalledWith(['/login'])
  })

  it('still signs out locally when Cognito rejects', () => {
    const { component, profiles, router } = build({ signOutFails: true })

    component.signOut()

    // Amplify rejects when the session has already gone. The user asked to
    // leave either way — stranding them signed-in-looking would be worse.
    expect(profiles.clear).toHaveBeenCalled()
    expect(router.navigate).toHaveBeenCalledWith(['/login'])
  })

  it('closes the menu when signing out', () => {
    const { component } = build()
    component.profileMenuOpen = true

    component.signOut()

    expect(component.profileMenuOpen).toBe(false)
  })

  it('falls back through username, email, then a generic label', () => {
    expect(build().component.displayName).toBe('domgiordano')
    expect(
      build({ profile: profile({ sleeperUsername: '' }) }).component.displayName,
    ).toBe('d@x.com')
    expect(build({ profile: null }).component.displayName).toBe('My Profile')
  })
})
