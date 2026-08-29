/**
 * Tests for the comment thread.
 *
 * The component is deliberately dumb: the server decides who may delete and
 * whether you liked something, and each response is the whole thread. What
 * is worth pinning is that it actually replaces its list from those
 * responses rather than patching optimistically, and that a failed post says
 * so instead of appearing to have worked.
 */
import { of, throwError } from 'rxjs'
import { CommentThreadComponent } from './comment-thread.component'
import { Comment } from 'src/app/services/comments.service'

function comment(overrides: Partial<Comment> = {}): Comment {
  return {
    commentId: 'c1',
    body: 'hello',
    createdAt: '2026-08-29T00:00:00Z',
    author: { userId: 'u1', displayName: 'Ay', sleeperAvatar: '' },
    mentions: [],
    likeCount: 0,
    likedByMe: false,
    mine: false,
    ...overrides,
  }
}

function build(options: { thread?: Comment[]; addFails?: boolean; addError?: string } = {}) {
  const { thread = [], addFails = false, addError } = options
  const service = {
    list: jasmine.createSpy('list').and.returnValue(of(thread)),
    add: jasmine.createSpy('add').and.callFake(() =>
      addFails
        ? throwError(() => ({ error: { error: { message: addError ?? 'nope' } } }))
        : of([comment({ body: 'posted' })]),
    ),
    react: jasmine.createSpy('react').and.returnValue(of([comment({ likedByMe: true, likeCount: 1 })])),
    remove: jasmine.createSpy('remove').and.returnValue(of([])),
  }
  const component = new CommentThreadComponent(service as never)
  component.targetType = 'league'
  component.targetId = 'l1'
  return { component, service }
}

describe('CommentThreadComponent', () => {
  it('loads the thread for its target', () => {
    const { component, service } = build({ thread: [comment()] })

    component.ngOnInit()

    expect(service.list).toHaveBeenCalledWith('league', 'l1')
    expect(component.comments.length).toBe(1)
    expect(component.loading).toBe(false)
  })

  it('does not fetch without a target', () => {
    const { component, service } = build()
    component.targetId = ''

    component.ngOnInit()

    expect(service.list).not.toHaveBeenCalled()
    expect(component.loading).toBe(false)
  })

  it('posts a trimmed comment and clears the draft', () => {
    const { component, service } = build()
    component.ngOnInit()
    component.draft = '  something  '

    component.post()

    // Three args: mentions default to none in the service. @mentions have
    // backend support but no UI to raise them yet.
    expect(service.add).toHaveBeenCalledWith('league', 'l1', 'something')
    expect(component.draft).toBe('')
  })

  it('replaces the thread from the response', () => {
    const { component } = build()
    component.ngOnInit()
    component.draft = 'x'

    component.post()

    // Each response is the whole thread; patching optimistically would let
    // the client drift from the server.
    expect(component.comments[0].body).toBe('posted')
  })

  it('refuses an empty draft without a call', () => {
    const { component, service } = build()
    component.ngOnInit()
    component.draft = '   '

    component.post()

    expect(service.add).not.toHaveBeenCalled()
  })

  it('surfaces a failed post', () => {
    const { component } = build({ addFails: true, addError: 'Comment cannot be empty' })
    component.ngOnInit()
    component.draft = 'x'

    component.post()

    // The user typed something; silence would read as success.
    expect(component.error).toBe('Comment cannot be empty')
    expect(component.posting).toBe(false)
  })

  it('toggles a like to the opposite of what the server said', () => {
    const { component, service } = build({ thread: [comment({ likedByMe: false })] })
    component.ngOnInit()

    component.toggleLike(component.comments[0])

    expect(service.react).toHaveBeenCalledWith('league', 'l1', 'c1', true)
    expect(component.comments[0].likedByMe).toBe(true)
  })

  it('removes a comment and takes the new thread', () => {
    const { component, service } = build({ thread: [comment({ mine: true })] })
    component.ngOnInit()

    component.remove(component.comments[0])

    expect(service.remove).toHaveBeenCalledWith('league', 'l1', 'c1')
    expect(component.comments).toEqual([])
  })

  it('falls back to a placeholder initial', () => {
    const { component } = build()

    expect(component.initials(comment({ author: { userId: '', displayName: '', sleeperAvatar: '' } }))).toBe('?')
  })
})
