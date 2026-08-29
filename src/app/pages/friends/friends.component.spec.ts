/**
 * The bug these cover was in the template, not the class: incoming rows
 * linked to /profile (your own page) and the other two groups did not link at
 * all. So these assert against rendered DOM -- a test of the class alone
 * would have passed while the page stayed broken.
 */
import { ComponentFixture, TestBed } from '@angular/core/testing'
import { RouterTestingModule } from '@angular/router/testing'
import { By } from '@angular/platform-browser'
import { of } from 'rxjs'
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
}

describe('FriendsComponent links', () => {
  let fixture: ComponentFixture<FriendsComponent>

  const render = async (graph: FriendGraph) => {
    await TestBed.configureTestingModule({
      imports: [FriendsComponent, RouterTestingModule],
      providers: [
        { provide: FriendsService, useValue: { load: () => of(graph) } },
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
    })

    expect(fixture.debugElement.queryAll(By.css('a.person-name')).length).toBe(0)
    expect(fixture.debugElement.query(By.css('span.person-name')).nativeElement.textContent)
      .toContain('dee display')
  })

  it('still labels an unanswered outgoing request', async () => {
    await render({ friends: [], incoming: [], outgoing: [person('cal')], pendingCount: 0 })
    expect(fixture.nativeElement.textContent).toContain('Waiting for an answer')
  })
})
