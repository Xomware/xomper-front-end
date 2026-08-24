import { Injectable } from '@angular/core'
import { League } from '../models/league.interface'
import {
  FingerprintClamp,
  FormatFingerprint,
  LeagueFormat,
} from '../models/value-book.model'

/**
 * Maps a Sleeper league object onto the format axes the value source supports,
 * recording every place the league had to be approximated.
 *
 * Phase 0 measured how much each axis actually moves values:
 *   numQbs 1 vs 2      Josh Allen 10686 -> 5766   (~85% swing, dominant)
 *   isDynasty t/f      473 entries -> 193, picks disappear (structural)
 *   ppr 1 vs 0         ~1.7% (noise)
 *   numTeams 12 vs 14  ~0.6% (noise)
 *
 * So the fingerprint is really `isDynasty x numQbs`; `ppr` and `numTeams` are
 * carried for fidelity but clamping them is close to harmless. Clamping
 * `numQbs` would not be, which is why it can't happen — Sleeper only ever
 * yields 1 or 2.
 */

/** FantasyCalc honors these; anything else snaps to the nearest. */
export const SUPPORTED_TEAM_COUNTS = [8, 10, 12, 14, 16] as const
export const SUPPORTED_PPR = [0, 0.5, 1] as const

/** Sleeper `settings.type`. */
const LEAGUE_TYPE_REDRAFT = 0
const LEAGUE_TYPE_KEEPER = 1
const LEAGUE_TYPE_DYNASTY = 2

/**
 * Individual-defensive-player slots. Their presence means a large share of the
 * roster has no value coverage at all, so these leagues are refused outright
 * rather than charted from a fraction of the roster.
 */
const IDP_SLOTS = new Set([
  'DL', 'LB', 'DB', 'IDP_FLEX', 'DE', 'DT', 'CB', 'S', 'IDP',
])

@Injectable({ providedIn: 'root' })
export class LeagueSettingsFingerprintService {
  /**
   * Resolve a league to its format. Never throws — an unanalyzable league
   * comes back with `unsupportedReasons` populated so the UI can render an
   * explicit unsupported state instead of a plausible-looking wrong chart.
   */
  resolve(league: League): LeagueFormat {
    const clamps: FingerprintClamp[] = []
    const unsupportedReasons: string[] = []
    const approximations: string[] = []

    const rosterPositions = league.roster_positions ?? []
    const scoring = league.scoring_settings ?? {}
    const leagueType = this.leagueType(league)

    // --- isDynasty -----------------------------------------------------------
    // Keeper sits between redraft and dynasty. Dynasty is the closer base:
    // keeper rosters carry multi-year assets that redraft values price at zero.
    const isDynasty = leagueType !== LEAGUE_TYPE_REDRAFT
    const isKeeper = leagueType === LEAGUE_TYPE_KEEPER
    if (isKeeper) {
      approximations.push(
        'Keeper values are estimated from dynasty values. No source publishes ' +
          'keeper-specific values, because they depend on your keeper rules.',
      )
    }

    // --- numQbs --------------------------------------------------------------
    // Superflex is read directly off roster_positions; no inference needed.
    const hasSuperflex = rosterPositions.some(
      (p) => p.toUpperCase() === 'SUPER_FLEX',
    )
    const qbSlots = rosterPositions.filter((p) => p.toUpperCase() === 'QB').length
    const numQbs: 1 | 2 = hasSuperflex || qbSlots >= 2 ? 2 : 1

    // --- numTeams ------------------------------------------------------------
    const requestedTeams = league.total_rosters ?? 12
    const numTeams = this.nearest(requestedTeams, SUPPORTED_TEAM_COUNTS)
    if (numTeams !== requestedTeams) {
      clamps.push({ axis: 'numTeams', requested: requestedTeams, served: numTeams })
    }

    // --- ppr -----------------------------------------------------------------
    const requestedPpr = typeof scoring['rec'] === 'number' ? scoring['rec'] : 0
    const ppr = this.nearest(requestedPpr, SUPPORTED_PPR)
    if (ppr !== requestedPpr) {
      clamps.push({ axis: 'ppr', requested: requestedPpr, served: ppr })
    }

    // --- TE premium ----------------------------------------------------------
    // Not a FantasyCalc axis. Read it off the league so the UI can say so.
    const teBonus =
      typeof scoring['bonus_rec_te'] === 'number' ? scoring['bonus_rec_te'] : 0
    if (teBonus > 0) {
      approximations.push(
        `This league gives tight ends +${teBonus} per reception. Values shown ` +
          'do not include that bonus, so tight ends are undervalued here.',
      )
    }

    // --- hard stops ----------------------------------------------------------
    const idpSlots = rosterPositions.filter((p) =>
      IDP_SLOTS.has(p.toUpperCase()),
    )
    if (idpSlots.length > 0) {
      unsupportedReasons.push(
        `IDP league (${[...new Set(idpSlots)].join(', ')}). No free values ` +
          'source covers defensive players.',
      )
    }

    if (league.settings?.['best_ball'] === 1) {
      unsupportedReasons.push(
        'Best-ball league. Values assume a set lineup, so team analysis does ' +
          'not apply.',
      )
    }

    return {
      fingerprint: { isDynasty, numQbs, numTeams, ppr },
      clamps,
      unsupportedReasons,
      approximations,
      isKeeper,
      teBonus,
    }
  }

  /** Stable cache key. Also the warehouse sort key — see PLAN.md phase 3.4. */
  key(fingerprint: FormatFingerprint): string {
    const { isDynasty, numQbs, numTeams, ppr } = fingerprint
    return `d${isDynasty ? 1 : 0}_q${numQbs}_t${numTeams}_p${ppr}`
  }

  private leagueType(league: League): number {
    const raw = league.settings?.['type']
    return typeof raw === 'number' ? raw : LEAGUE_TYPE_DYNASTY
  }

  private nearest(value: number, supported: readonly number[]): number {
    return supported.reduce((best, candidate) =>
      Math.abs(candidate - value) < Math.abs(best - value) ? candidate : best,
    )
  }
}
