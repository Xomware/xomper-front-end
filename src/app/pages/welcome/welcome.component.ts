import { Component, OnInit } from '@angular/core'
import { NgFor, NgIf } from '@angular/common'
import { Router, RouterLink } from '@angular/router'
import { environment } from '../../../environments/environment'
import { SupabaseService } from '../../services/supabase.service'

interface Stat {
  value: string
  label: string
  note: string
}

interface Feature {
  title: string
  copy: string
  points: string[]
}

interface SampleRow {
  position: string
  /** Percent of the strongest team in the league at this position. */
  mine: number
  /** Where the league average sits, same scale. */
  league: number
  value: string
}

/**
 * Public landing page at `/`.
 *
 * Renders outside the app shell — see `AppComponent.isPublicLanding`. It used
 * to inherit the sidebar and toolbar, which put signed-in furniture in front
 * of people who had never signed in.
 *
 * The numbers below are measured, not marketing. They come from
 * `tools/coverage-report.py` run against 16 real leagues on 2026-08-25, and
 * the note under each says what it is. If the engine changes, re-run the tool
 * and update them rather than letting them drift into decoration.
 *
 * Branding is read from `environment`, because the same component ships in
 * two apps: the Xomper platform, and the CLT Dynasty League app it powers.
 */
@Component({
  selector: 'app-welcome',
  standalone: true,
  imports: [NgIf, NgFor, RouterLink],
  templateUrl: './welcome.component.html',
  styleUrls: ['./welcome.component.scss'],
})
export class WelcomeComponent implements OnInit {
  readonly appName = environment.appName
  readonly tagline = environment.appTagline
  readonly eyebrow = environment.appEyebrow
  /** True in the CLT app: shows "powered by" with the Xomper banner. */
  readonly showPoweredBy = environment.poweredByXomper
  /**
   * Secondary action. "Look up a league" is meaningless in an app that serves
   * exactly one league, so each app names its own.
   */
  readonly secondaryCta = environment.secondaryCta

  /**
   * Title split so the first line can carry the accent colour, matching the
   * house treatment on Reese's Playoff Challenge.
   */
  readonly titleLead = environment.appName.split(' ')[0]
  readonly titleRest = environment.appName.split(' ').slice(1).join(' ')

  /**
   * A static sample of real output. Static on purpose: the landing page makes
   * no network calls, so a first-time visitor never waits on a cold API or
   * watches a spinner where the product demo should be.
   */
  readonly sample: SampleRow[] = [
    { position: 'QB', mine: 92, league: 61, value: '18,400' },
    { position: 'RB', mine: 48, league: 66, value: '9,600' },
    { position: 'WR', mine: 78, league: 70, value: '15,600' },
    { position: 'TE', mine: 71, league: 44, value: '14,200' },
  ]

  readonly stats: Stat[] = [
    {
      value: '100%',
      label: 'of a redraft roster priced',
      note: 'measured on a 14-team league — 198 of 198 players, kickers and defenses included',
    },
    {
      value: '636',
      label: 'players projected',
      note: 'against 193 in the values source most tools borrow from',
    },
    {
      value: '0',
      label: 'players silently worth nothing',
      note: 'anyone we cannot price is named, not quietly scored as zero',
    },
  ]

  readonly features: Feature[] = [
    {
      title: 'Team analysis',
      copy:
        'Your roster scored by position against the rest of your league, ' +
        'using your league’s own scoring rules rather than a generic ' +
        'approximation of them.',
      points: [
        'TE premium, superflex and custom scoring read straight from the league',
        'Replacement level follows your roster slots and team count',
        'Coverage shown on every chart, so you know what it is built from',
      ],
    },
    {
      title: 'Trade evaluation',
      copy:
        'Grade a trade before you accept it, and see what would make a ' +
        'lopsided one fair.',
      points: [
        'Both sides valued in your format, picks included',
        'Suggested add-ons to close a gap',
        'Anything unpriceable is flagged rather than counted as zero',
      ],
    },
    {
      title: 'Draft board',
      copy:
        'Follow your live draft pick by pick, with the board and the room ' +
        'in front of you.',
      points: [
        'Live pick tracking with a countdown',
        'Rounds and board views, filterable to your picks',
        'Traded picks resolved to whoever actually owns them',
      ],
    },
  ]

  readonly limits: string[] = [
    'IDP and best-ball leagues are refused outright rather than charted from half a roster',
    'Keeper values are an estimate — no source publishes them, and we say so on the page',
    'Dynasty values cannot see this season’s scoring perfectly; where we adjust, we tell you by how much',
  ]

  constructor(
    private router: Router,
    private supabaseService: SupabaseService,
  ) {}

  ngOnInit(): void {
    // Someone already signed in has no use for a front door.
    if (this.supabaseService.isAuthenticated()) {
      this.router.navigate(['/home'])
    }
  }
}
