/**
 * Tests for AuthGuard.
 *
 * Each case here corresponds to a way the app has actually broken:
 *
 *  - deciding before the session resolved bounced authenticated users to
 *    /login and discarded the OAuth code
 *  - nothing routed unlinked accounts to /link-sleeper, so they sat on an
 *    empty app that looked broken
 *  - `myUser` was only ever set on the login path, so a refresh emptied the
 *    app for a perfectly valid session
 */
import { BehaviorSubject, of, throwError } from 'rxjs'
import { AuthGuard } from './auth.guard'
import { UserProfile } from '../services/user-profile.service'

function profile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    userId: 'cog-1',
    email: 'd@x.com',
    sleeperUserId: '594625531702460416',
    sleeperUsername: 'domgiordano',
    displayName: 'domgiordano',
    sleeperAvatar: '',
    hasLinkedSleeper: true,
    createdAt: '',
    updatedAt: '',
    ...overrides,
  }
}

interface Harness {
  guard: AuthGuard
  router: { navigate: jasmine.Spy }
  userService: { myUserSelected: () => boolean; setMyUser: jasmine.Spy; searchUser: jasmine.Spy }
  ready$: BehaviorSubject<boolean>
}

function harness(options: {
  authenticated?: boolean
  profile?: UserProfile | null
  profileErrors?: boolean
  myUserAlreadySet?: boolean
  ready?: boolean
} = {}): Harness {
  const {
    authenticated = true,
    profile: prof = profile(),
    profileErrors = false,
    myUserAlreadySet = false,
    ready = true,
  } = options

  const ready$ = new BehaviorSubject<boolean>(ready)
  const router = { navigate: jasmine.createSpy('navigate') }

  const userService = {
    myUserSelected: () => myUserAlreadySet,
    setMyUser: jasmine.createSpy('setMyUser'),
    searchUser: jasmine.createSpy('searchUser').and.returnValue(
      of({ user_id: '594625531702460416', display_name: 'Dom' }),
    ),
  }

  const guard = new AuthGuard(
    {
      isReady$: ready$.asObservable(),
      isAuthenticated: () => authenticated,
    } as never,
    {
      load: () =>
        profileErrors ? throwError(() => new Error('boom')) : of(prof),
    } as never,
    { leagues: [], load: () => of([]) } as never,
    { load: () => of(null) } as never,
    userService as never,
    { loadMyLeague: () => of({}) } as never,
    router as never,
  )

  return { guard, router, userService, ready$ }
}

const route = {} as never
const state = (url: string) => ({ url }) as never

describe('AuthGuard', () => {
  it('allows a signed-in, linked user through', async () => {
    const { guard, router } = harness()

    await expectAsync(guard.canActivate(route, state('/home'))).toBeResolvedTo(true)
    expect(router.navigate).not.toHaveBeenCalled()
  })

  it('redirects an unauthenticated user to /login', async () => {
    const { guard, router } = harness({ authenticated: false })

    await expectAsync(guard.canActivate(route, state('/home'))).toBeResolvedTo(false)
    expect(router.navigate).toHaveBeenCalledWith(['/login'])
  })

  it('waits for the session before deciding', async () => {
    const { guard, router, ready$ } = harness({ ready: false })

    let settled = false
    const decision = guard.canActivate(route, state('/home')).then((v) => {
      settled = true
      return v
    })

    await Promise.resolve()
    // Deciding here would send an authenticated user to /login and drop the
    // OAuth code before it could be redeemed.
    expect(settled).toBe(false)
    expect(router.navigate).not.toHaveBeenCalled()

    ready$.next(true)
    await expectAsync(decision).toBeResolvedTo(true)
  })

  it('sends an unlinked account to /link-sleeper', async () => {
    const { guard, router } = harness({
      profile: profile({ hasLinkedSleeper: false, sleeperUserId: '' }),
    })

    await expectAsync(guard.canActivate(route, state('/home'))).toBeResolvedTo(false)
    expect(router.navigate).toHaveBeenCalledWith(['/link-sleeper'])
  })

  it('does not redirect when already on the link page', async () => {
    const { guard, router } = harness({
      profile: profile({ hasLinkedSleeper: false, sleeperUserId: '' }),
    })

    // The link page is itself guarded, so redirecting from it loops forever.
    await expectAsync(
      guard.canActivate(route, state('/link-sleeper')),
    ).toBeResolvedTo(true)
    expect(router.navigate).not.toHaveBeenCalled()
  })

  it('resolves myUser from the profile', async () => {
    const { guard, userService } = harness()

    await guard.canActivate(route, state('/home'))

    // Without this a refresh or deep link leaves every getMyUser() consumer
    // looking at null for a perfectly valid session.
    expect(userService.searchUser).toHaveBeenCalledWith('594625531702460416')
    expect(userService.setMyUser).toHaveBeenCalled()
  })

  it('does not refetch myUser when it is already set', async () => {
    const { guard, userService } = harness({ myUserAlreadySet: true })

    await guard.canActivate(route, state('/home'))

    expect(userService.searchUser).not.toHaveBeenCalled()
  })

  it('lets the user through when Sleeper cannot be reached', async () => {
    const { guard, userService, router } = harness()
    userService.searchUser.and.returnValue(throwError(() => new Error('down')))

    await expectAsync(guard.canActivate(route, state('/home'))).toBeResolvedTo(true)
    expect(router.navigate).not.toHaveBeenCalled()
  })

  it('lets the user through when the profile load fails', async () => {
    const { guard, router } = harness({ profileErrors: true })

    // A sparse app beats trapping someone in a redirect to a page they have
    // already completed.
    await expectAsync(guard.canActivate(route, state('/home'))).toBeResolvedTo(true)
    expect(router.navigate).not.toHaveBeenCalled()
  })
})
