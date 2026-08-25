/**
 * Per-league value lookup types.
 *
 * Replaces the single-league singleton in `PlayerValuesService`, where every
 * lookup resolved against one hardcoded FantasyCalc endpoint tuned to the CLT
 * league. A `ValueBook` is scoped to one league's format fingerprint and is
 * immutable once built.
 *
 * The critical change is `ValueLookup`: the old API returned a bare `0` for
 * both "this player is worthless" and "this player isn't in our data", and
 * callers could not tell the difference. See `ValueCoverage`.
 */

/** The four axes FantasyCalc actually parameterizes on. */
export interface FormatFingerprint {
  isDynasty: boolean
  /** 2 for superflex / 2QB leagues, 1 otherwise. Dominant value axis (~85% swing). */
  numQbs: 1 | 2
  numTeams: number
  /** Points per reception: 0, 0.5, or 1. */
  ppr: number
}

/** Records an axis whose requested value had to be snapped to a supported one. */
export interface FingerprintClamp {
  axis: keyof FormatFingerprint
  requested: number | boolean
  served: number | boolean
}

/**
 * A league's resolved format, plus everything the UI needs to report honestly
 * how far the served values are from what the league actually is.
 */
export interface LeagueFormat {
  fingerprint: FormatFingerprint
  /** Axes snapped to the nearest supported value. Drives "nearest format" notes. */
  clamps: FingerprintClamp[]
  /** Hard stops — render an unsupported state, never a chart. */
  unsupportedReasons: string[]
  /** Soft caveats — render, but label the numbers as estimates. */
  approximations: string[]
  isKeeper: boolean
  /** `bonus_rec_te` from scoring_settings. Non-zero means TE-premium scoring. */
  teBonus: number

  /**
   * The league's raw scoring rules. Carried so a provider can compute values
   * from the league's own scoring instead of borrowing a nearby format.
   */
  scoringSettings: Record<string, number>
  /** The league's raw roster slots. Drives replacement level. */
  rosterPositions: string[]
}

/** True when the league cannot be analyzed honestly at all. */
export function isSupported(format: LeagueFormat): boolean {
  return format.unsupportedReasons.length === 0
}

/** True when values are served, but from a format that isn't an exact match. */
export function isApproximate(format: LeagueFormat): boolean {
  return format.clamps.length > 0 || format.approximations.length > 0
}

/**
 * The result of a value lookup. `known: false` means the player is absent from
 * the source, NOT that they are worth nothing — the distinction the old
 * bare-`0` API destroyed.
 */
export interface ValueLookup {
  value: number
  known: boolean
}

export const UNKNOWN: ValueLookup = Object.freeze({ value: 0, known: false })

export function known(value: number): ValueLookup {
  return { value, known: true }
}

/** How much of a roster the value source actually covered. */
export interface ValueCoverage {
  rostered: number
  valued: number
  unvaluedIds: string[]
  /** Unvalued players who are in the STARTING lineup — the serious case. */
  unvaluedStarterIds: string[]
}

export function emptyCoverage(): ValueCoverage {
  return { rostered: 0, valued: 0, unvaluedIds: [], unvaluedStarterIds: [] }
}

/** 0..1. Returns 1 for an empty roster so a bare roster isn't flagged as broken. */
export function coverageRatio(coverage: ValueCoverage): number {
  if (coverage.rostered === 0) return 1
  return coverage.valued / coverage.rostered
}

/**
 * Coverage below this reads as "we can't analyze this team" rather than
 * "a couple of players are missing". Redraft leagues routinely land here
 * because FantasyCalc returns ~193 players and carries no K or DEF.
 */
export const LOW_COVERAGE_THRESHOLD = 0.8

export function isLowCoverage(coverage: ValueCoverage): boolean {
  return coverageRatio(coverage) < LOW_COVERAGE_THRESHOLD
}

/**
 * Immutable, format-scoped value lookup. One book per league fingerprint.
 */
export interface ValueBook {
  readonly format: LeagueFormat
  readonly loadedAt: number
  /** Number of valued players (excludes picks). */
  readonly size: number
  value(playerId: string): ValueLookup
  position(playerId: string): string | null
  pickValue(name: string): ValueLookup
  readonly allPickNames: string[]
  pickNames(forYears: Set<number>): string[]
}

/** Map-backed `ValueBook`. Built once by a provider, then read-only. */
export class MapValueBook implements ValueBook {
  constructor(
    readonly format: LeagueFormat,
    private readonly valuesById: ReadonlyMap<string, number>,
    private readonly positionsById: ReadonlyMap<string, string>,
    private readonly pickValuesByName: ReadonlyMap<string, number>,
    private readonly pickYearsByName: ReadonlyMap<string, number>,
    readonly loadedAt: number,
  ) {}

  get size(): number {
    return this.valuesById.size
  }

  value(playerId: string): ValueLookup {
    const v = this.valuesById.get(playerId)
    return v === undefined ? UNKNOWN : known(v)
  }

  position(playerId: string): string | null {
    return this.positionsById.get(playerId) ?? null
  }

  pickValue(name: string): ValueLookup {
    const v = this.pickValuesByName.get(name)
    return v === undefined ? UNKNOWN : known(v)
  }

  get allPickNames(): string[] {
    return [...this.pickValuesByName.entries()]
      .sort(([, a], [, b]) => b - a)
      .map(([name]) => name)
  }

  pickNames(forYears: Set<number>): string[] {
    return [...this.pickValuesByName.entries()]
      .filter(([name]) => {
        const year = this.pickYearsByName.get(name)
        return year !== undefined && forYears.has(year)
      })
      .sort(([, a], [, b]) => b - a)
      .map(([name]) => name)
  }
}
