import { Component } from '@angular/core'
import { LandingOverviewCardComponent } from './cards/landing-overview-card/landing-overview-card.component'
import { LandingHeadlineCardComponent } from './cards/landing-headline-card/landing-headline-card.component'
import { LandingDraftCountdownCardComponent } from './cards/landing-draft-countdown-card/landing-draft-countdown-card.component'
import { LandingAnnouncementsCardComponent } from './cards/landing-announcements-card/landing-announcements-card.component'
import { LandingStandingsScrollCardComponent } from './cards/landing-standings-scroll-card/landing-standings-scroll-card.component'
import { LandingThisWeekCardComponent } from './cards/landing-this-week-card/landing-this-week-card.component'

/**
 * Landing hub host — composition only, no fetch logic.
 *
 * The overview card comes first and is the only league-agnostic one: your
 * leagues and the jump-off points into the app. Everything below it is scoped
 * to whichever league is selected, which is why this page previously read as
 * a view of one league rather than of the app.
 */
@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [
    LandingOverviewCardComponent,
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
