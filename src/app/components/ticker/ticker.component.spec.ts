/**
 * Tests for the rotating ticker.
 *
 * It sits above every page, so its failure mode matters more than its
 * content: an empty or erroring ticker must render nothing and take nothing
 * with it.
 */
import { Subject } from 'rxjs'
import { of, throwError } from 'rxjs'
import { NavigationEnd } from '@angular/router'
import { TickerComponent } from './ticker.component'
import { TickerItem } from 'src/app/services/ticker.service'

function item(label: string): TickerItem {
  return { label, text: `${label} text`, tone: 'neutral' }
}

function build(items: TickerItem[] | 'error' = [item('One'), item('Two')]) {
  const events = new Subject<unknown>()
  const ticker = {
    itemsFor: jasmine
      .createSpy('itemsFor')
      .and.callFake(() => (items === 'error' ? throwError(() => new Error('x')) : of(items))),
  }
  const router = { events, url: '/home' }
  const component = new TickerComponent(ticker as never, router as never, {
    onDestroy: () => undefined,
  } as never)
  return { component, ticker, router, events }
}

describe('TickerComponent', () => {
  it('loads items on init', () => {
    const { component } = build()

    component.ngOnInit()

    expect(component.items.length).toBe(2)
    expect(component.current?.label).toBe('One')
  })

  it('renders nothing when there is nothing to say', () => {
    const { component } = build([])

    component.ngOnInit()

    // The template keys on `current`; null means no bar at all rather than an
    // empty strip.
    expect(component.current).toBeNull()
  })

  it('advances and wraps', () => {
    const { component } = build()
    component.ngOnInit()

    component.next()
    expect(component.current?.label).toBe('Two')

    component.next()
    expect(component.current?.label).toBe('One')
  })

  it('does not advance with a single item', () => {
    const { component } = build([item('Only')])
    component.ngOnInit()

    component.next()

    expect(component.index).toBe(0)
  })

  it('rebuilds on navigation and asks for the new url', () => {
    const { component, ticker, router, events } = build()
    component.ngOnInit()
    component.next()

    ;(router as { url: string }).url = '/trades'
    events.next(new NavigationEnd(1, '/trades', '/trades'))

    // Content is page-aware, and the index resets so the first line of the
    // new page is the one shown.
    expect(ticker.itemsFor).toHaveBeenCalledWith('/trades')
    expect(component.index).toBe(0)
  })
})
