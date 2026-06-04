import { Component } from '@angular/core'
import { LandingHeadlineCardComponent } from './cards/landing-headline-card/landing-headline-card.component'
import { LandingDraftCountdownCardComponent } from './cards/landing-draft-countdown-card/landing-draft-countdown-card.component'
import { LandingAnnouncementsCardComponent } from './cards/landing-announcements-card/landing-announcements-card.component'
import { LandingStandingsScrollCardComponent } from './cards/landing-standings-scroll-card/landing-standings-scroll-card.component'
import { LandingThisWeekCardComponent } from './cards/landing-this-week-card/landing-this-week-card.component'

/**
 * Landing hub host — composition only, no fetch logic.
 * Mirrors iOS LandingView: composes 5 cards in a vertical stack.
 * Order: Headline AI Report → Upcoming Draft countdown → Announcements
 *        → Standings scroll bar → This-week matchups.
 */
@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [
    LandingHeadlineCardComponent,
    LandingDraftCountdownCardComponent,
    LandingAnnouncementsCardComponent,
    LandingStandingsScrollCardComponent,
    LandingThisWeekCardComponent,
  ],
  templateUrl: './landing.component.html',
  styleUrls: ['./landing.component.scss'],
})
export class LandingComponent {}
