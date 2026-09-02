/**
 * "a lot of our pages need a few things: more content and data and someway to
 * know what all is on the apge"
 *
 * The long pages grew several sections each, and a reader landing on one had
 * no way to know what was further down short of scrolling to find out.
 */
import { PageSectionsComponent } from './page-sections.component'

describe('PageSectionsComponent', () => {
  let root: HTMLElement

  function build(html: string, selector = 'h2') {
    root = document.createElement('div')
    root.className = 'test-scope'
    root.innerHTML = html
    document.body.appendChild(root)

    const component = new PageSectionsComponent({
      nativeElement: { ownerDocument: document },
    } as never)
    component.headingSelector = selector
    component.scope = '.test-scope'
    ;(component as never as { collect(): void }).collect()
    return component
  }

  afterEach(() => root?.remove())

  it('lists the headings it finds', () => {
    const c = build('<h2>Career</h2><h2>Season by season</h2>')

    expect(c.sections.map((s) => s.label)).toEqual(['Career', 'Season by season'])
  })

  it('gives a heading an id when it has none', () => {
    const c = build('<h2>Career</h2>')

    // Without an id there is nothing for the link to target.
    expect(c.sections[0].id).toBeTruthy()
    expect(root.querySelector('h2')?.id).toBe(c.sections[0].id)
  })

  it('keeps an id the page already set', () => {
    const c = build('<h2 id="mine">Career</h2>')

    expect(c.sections[0].id).toBe('mine')
  })

  it('ignores an empty heading', () => {
    const c = build('<h2>Career</h2><h2>   </h2>')

    expect(c.sections.length).toBe(1)
  })

  it('honours a custom selector', () => {
    const c = build('<h2>Skip</h2><h3 class="pick">Take</h3>', '.pick')

    expect(c.sections.map((s) => s.label)).toEqual(['Take'])
  })

  it('finds nothing in an empty page', () => {
    const c = build('<p>no headings</p>')

    expect(c.sections).toEqual([])
  })

  it('marks the section it jumps to', () => {
    const c = build('<h2 id="a">A</h2><h2 id="b">B</h2>')

    c.jumpTo('b')

    expect(c.activeId).toBe('b')
  })

  it('ignores a jump to something that is not there', () => {
    const c = build('<h2 id="a">A</h2>')

    expect(() => c.jumpTo('missing')).not.toThrow()
    expect(c.activeId).toBe('')
  })

  it('disconnects its observer on destroy', () => {
    const c = build('<h2>A</h2><h2>B</h2>')

    expect(() => c.ngOnDestroy()).not.toThrow()
  })
})
