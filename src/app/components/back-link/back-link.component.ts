import { Component, Input } from '@angular/core'
import { Location } from '@angular/common'
import { Router } from '@angular/router'

/**
 * "Back to where you came from."
 *
 * Uses browser history rather than a fixed parent route, because these pages
 * are reached from several directions -- a team from standings, from search,
 * or from a matchup -- and a hardcoded parent would send people somewhere
 * they were never coming from.
 *
 * `fallback` covers a cold entry: a shared link or a refresh has no history
 * to go back to, and the arrow must not be a dead control.
 */
@Component({
  selector: 'app-back-link',
  standalone: true,
  template: `
    <button type="button" class="back-link" (click)="goBack()" [attr.aria-label]="label">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
           stroke-width="2" aria-hidden="true">
        <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
      </svg>
      <span>{{ label }}</span>
    </button>
  `,
  styleUrls: ['./back-link.component.scss'],
})
export class BackLinkComponent {
  @Input() label = 'Back'

  /** Where to go when there is no history to return to. */
  @Input() fallback = '/home'

  constructor(
    private location: Location,
    private router: Router,
  ) {}

  goBack(): void {
    // A direct load leaves history with only this entry, so popping it would
    // leave the app.
    if (this.hasHistory()) {
      this.location.back()
      return
    }
    this.router.navigateByUrl(this.fallback)
  }

  private hasHistory(): boolean {
    return typeof history !== 'undefined' && history.length > 1
  }
}
