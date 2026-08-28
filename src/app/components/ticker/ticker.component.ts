import { Component, DestroyRef, OnInit } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { NgIf, NgClass } from '@angular/common'
import { NavigationEnd, Router } from '@angular/router'
import { interval } from 'rxjs'
import { filter, startWith, switchMap } from 'rxjs/operators'
import { TickerItem, TickerService } from 'src/app/services/ticker.service'

/** How long each line holds before the next rotates in. */
const ROTATE_MS = 5000

/**
 * The rotating bar above every page.
 *
 * Content is page-aware: a ticker that says the same thing everywhere stops
 * being read after the first screen. It rebuilds on navigation and rotates
 * one line at a time.
 *
 * Hidden entirely when there is nothing to say, rather than showing an empty
 * strip — and every source is failure-tolerant, so a broken ticker never
 * takes a page down with it.
 */
@Component({
  selector: 'app-ticker',
  standalone: true,
  imports: [NgIf, NgClass],
  templateUrl: './ticker.component.html',
  styleUrls: ['./ticker.component.scss'],
})
export class TickerComponent implements OnInit {
  items: TickerItem[] = []
  index = 0

  // Constructor-injected rather than inject() in a field initializer, so the
  // component can be constructed directly in a spec.
  constructor(
    private ticker: TickerService,
    private router: Router,
    private destroyRef: DestroyRef,
  ) {}

  get current(): TickerItem | null {
    return this.items[this.index] ?? null
  }

  ngOnInit(): void {
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        startWith(null),
        switchMap(() => this.ticker.itemsFor(this.router.url)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((items) => {
        this.items = items
        this.index = 0
      })

    interval(ROTATE_MS)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        if (this.items.length > 1) {
          this.index = (this.index + 1) % this.items.length
        }
      })
  }

  /** Manual advance, for anyone who would rather not wait five seconds. */
  next(): void {
    if (this.items.length > 1) {
      this.index = (this.index + 1) % this.items.length
    }
  }
}
