import {
  AfterViewInit,
  Component,
  ElementRef,
  Input,
  OnDestroy,
} from '@angular/core'
import { NgFor, NgIf } from '@angular/common'

interface Section {
  id: string
  label: string
}

/**
 * What is on this page, and a way to get to it.
 *
 * The long pages -- profile, team, league overview -- grew several sections
 * each, and a reader landing on one had no way to know what was further down
 * short of scrolling to find out.
 *
 * Reads the headings already in the page rather than taking a list: a
 * hardcoded index goes stale the moment a section is added, and this is meant
 * to answer "what is here", which only the page knows.
 */
@Component({
  selector: 'app-page-sections',
  standalone: true,
  imports: [NgIf, NgFor],
  template: `
    <nav class="sections" *ngIf="sections.length > 1" aria-label="On this page">
      <span class="sections-label">On this page</span>
      <button
        type="button"
        class="section-link"
        *ngFor="let section of sections"
        [class.section-link--active]="section.id === activeId"
        (click)="jumpTo(section.id)"
      >
        {{ section.label }}
      </button>
    </nav>
  `,
  styleUrls: ['./page-sections.component.scss'],
})
export class PageSectionsComponent implements AfterViewInit, OnDestroy {
  /** CSS selector for the headings that count as sections. */
  @Input() headingSelector = 'h2'

  /** Where to look. Defaults to the whole document. */
  @Input() scope: string | null = null

  sections: Section[] = []
  activeId = ''

  private observer: IntersectionObserver | null = null
  private mutations: MutationObserver | null = null

  constructor(private host: ElementRef<HTMLElement>) {}

  ngAfterViewInit(): void {
    // The sections around this component arrive with their data, well after
    // first paint -- collecting once found only whatever had rendered
    // already, which on the profile was the league list and nothing else.
    setTimeout(() => {
      this.collect()
      this.watchForSections()
    }, 0)
  }

  ngOnDestroy(): void {
    this.observer?.disconnect()
    this.mutations?.disconnect()
  }

  /** Re-collect when the page grows a section. */
  private watchForSections(): void {
    if (typeof MutationObserver === 'undefined') return
    const root = this.scope ? document.querySelector(this.scope) : null
    if (!root) return

    this.mutations = new MutationObserver(() => this.collect())
    this.mutations.observe(root, { childList: true, subtree: true })
  }

  private collect(): void {
    const root = this.scope
      ? document.querySelector(this.scope)
      : this.host.nativeElement.ownerDocument
    if (!root) return

    const headings = Array.from(root.querySelectorAll<HTMLElement>(this.headingSelector))
    this.sections = headings
      .filter((h) => (h.textContent ?? '').trim())
      .map((heading, index) => {
        // Give the heading an id if it has none, so the link has a target.
        if (!heading.id) heading.id = `section-${index}`
        return { id: heading.id, label: (heading.textContent ?? '').trim() }
      })

    this.watch(headings)
  }

  /** Mark whichever section is on screen, so the index says where you are. */
  private watch(headings: HTMLElement[]): void {
    if (typeof IntersectionObserver === 'undefined') return

    this.observer?.disconnect()
    this.observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
        if (visible?.target instanceof HTMLElement) this.activeId = visible.target.id
      },
      // Top band only: a heading counts as "where you are" when it reaches
      // the top of the view, not when it first appears at the bottom.
      { rootMargin: '0px 0px -70% 0px' },
    )
    headings.forEach((h) => this.observer?.observe(h))
  }

  jumpTo(id: string): void {
    const target = document.getElementById(id)
    if (!target) return
    this.activeId = id
    target.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}
