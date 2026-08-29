/**
 * The bug these cover was in the template, not the class: incoming rows
 * linked to /profile (your own page) and the other two groups did not link at
 * all. So these assert against rendered DOM -- a test of the class alone
 * would have passed while the page stayed broken.
 */
import { ComponentFixture, TestBed } from '@angular/core/testing'
import { RouterTestingModule } from '@angular/router/testing'
import { By } from '@angular/platform-browser'
import { of, throwError } from 'rxjs'
import { FriendsComponent } from './friends.component'
import { FriendsService, FriendGraph } from 'src/app/services/friends.service'
import { UserService } from 'src/app/services/user.service'

const person = (n: string) => ({
  userId: `cognito-${n}`,
  displayName: `${n} display`,
  sleeperUsername: `${n}handle`,
  sleeperAvatar: '',
  since: '2026-01-01',
})

const GRAPH: FriendGraph = {
  friends: [person('amy')],
  incoming: [person('bob')],
  outgoing: [person('cal')],
  pendingCount: 1,
  suggestions: [],
}

describe('FriendsComponent links', () => {
  let fixture: ComponentFixture<FriendsComponent>

  let requested: string[]

  const render = async (graph: FriendGraph, requestResult?: unknown) => {
    requested = []
    await TestBed.configureTestingModule({
      imports: [FriendsComponent, RouterTestingModule],
      providers: [
        {
          provide: FriendsService,
          useValue: {
            load: () => of(graph),
            request: (userId: string) => {
              requested.push(userId)
              return requestResult instanceof Error
                ? throwError(() => requestResult)
                : of({ ...graph, suggestions: [] })
            },
          },
        },
        { provide: UserService, useValue: { buildAvatar: () => 'avatar.png' } },
      ],
    }).compileComponents()
    fixture = TestBed.createComponent(FriendsComponent)
    fixture.detectChanges()
  }

  afterEach(() => TestBed.resetTestingModule())

  it('links every person to their own profile, not yours', async () => {
    await render(GRAPH)
    const links = fixture.debugElement.queryAll(By.css('a.person-name'))

    expect(links.length).toBe(3)
    for (const link of links) {
      const href = link.nativeElement.getAttribute('href')
      // /profile is the signed-in user's own page -- linking there showed you
      // yourself instead of the person you were looking up.
      expect(href).toContain('/selected-profile')
      expect(href).toContain('userId=')
    }
  })

  it('sends the Sleeper handle, which is what the profile route resolves', async () => {
    await render({ ...GRAPH, friends: [], outgoing: [] })
    const href = fixture.debugElement
      .query(By.css('a.person-name'))
      .nativeElement.getAttribute('href')

    // cognito-bob would 404 -- the route resolves through Sleeper.
    expect(href).toContain('bobhandle')
    expect(href).not.toContain('cognito')
  })

  it('shows a name without a link when there is no handle to resolve', async () => {
    await render({
      friends: [{ ...person('dee'), sleeperUsername: '' }],
      incoming: [],
      outgoing: [],
      pendingCount: 0,
      suggestions: [],
    })

    expect(fixture.debugElement.queryAll(By.css('a.person-name')).length).toBe(0)
    expect(fixture.debugElement.query(By.css('span.person-name')).nativeElement.textContent)
      .toContain('dee display')
  })

  it('still labels an unanswered outgoing request', async () => {
    await render({
      friends: [],
      incoming: [],
      outgoing: [person('cal')],
      pendingCount: 0,
      suggestions: [],
    })
    expect(fixture.nativeElement.textContent).toContain('Waiting for an answer')
  })
})

/**
 * Before this section existed, FriendsService.request() had no caller
 * anywhere in the app: the graph could never become non-empty, so friends,
 * the bell and @mentions were all unreachable.
 */
describe('FriendsComponent adding a leaguemate', () => {
  let fixture: ComponentFixture<FriendsComponent>
  let requested: string[]

  const SUGGESTED: FriendGraph = {
    friends: [],
    incoming: [],
    outgoing: [],
    pendingCount: 0,
    suggestions: [person('eve'), person('fay')],
  }

  const render = async (graph: FriendGraph, requestResult?: unknown) => {
    requested = []
    await TestBed.configureTestingModule({
      imports: [FriendsComponent, RouterTestingModule],
      providers: [
        {
          provide: FriendsService,
          useValue: {
            load: () => of(graph),
            request: (userId: string) => {
              requested.push(userId)
              return requestResult instanceof Error
                ? throwError(() => requestResult)
                : of({ ...graph, suggestions: [] })
            },
          },
        },
        { provide: UserService, useValue: { buildAvatar: () => 'avatar.png' } },
      ],
    }).compileComponents()
    fixture = TestBed.createComponent(FriendsComponent)
    fixture.detectChanges()
  }

  const addButtons = () =>
    fixture.debugElement
      .queryAll(By.css('button'))
      .filter((b) => b.nativeElement.textContent.trim() === 'Add friend')

  afterEach(() => TestBed.resetTestingModule())

  it('offers an add button for each leaguemate', async () => {
    await render(SUGGESTED)
    expect(addButtons().length).toBe(2)
  })

  it('sends the request with the Cognito id, not the handle', async () => {
    await render(SUGGESTED)
    addButtons()[0].nativeElement.click()

    // The server rejects a Sleeper handle as a target on purpose: handle
    // claims are unverified, so one would let anyone befriend as someone else.
    expect(requested).toEqual(['cognito-eve'])
  })

  it('drops only the person added, keeping the rest of the list', async () => {
    await render(SUGGESTED)
    addButtons()[0].nativeElement.click()
    fixture.detectChanges()

    // The mutation response carries no suggestions, so reading them from it
    // emptied the whole list after a single add.
    const left = addButtons()
    expect(left.length).toBe(1)
    expect(fixture.nativeElement.textContent).toContain('fay display')
    expect(fixture.nativeElement.textContent).not.toContain('eve display')
  })

  it('keeps the row and shows the error when the request fails', async () => {
    await render(SUGGESTED, new Error('nope'))
    addButtons()[0].nativeElement.click()
    fixture.detectChanges()

    // Removing the row on failure would leave no way to try again.
    expect(addButtons().length).toBe(2)
    expect(fixture.debugElement.query(By.css('.error'))).toBeTruthy()
  })

  it('does not call the page empty when only suggestions exist', async () => {
    await render(SUGGESTED)
    expect(fixture.nativeElement.textContent).not.toContain('Nobody yet')
  })
})
