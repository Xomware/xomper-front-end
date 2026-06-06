# Plan: Web ↔ iOS Parity — s8 Team Analyzer

**Status**: Done
**Created**: 2026-06-04
**Last updated**: 2026-06-06
**Epic**: [`../PLAN.md`](../PLAN.md)
**Brainstorm**: [`../BRAINSTORM.md`](../BRAINSTORM.md)

---

## TL;DR

Port iOS `TeamAnalyzerView` to web as a standalone `/team-analyzer` page with three tabs (Compare / League / Trade), a hand-rolled SVG hexagon radar, and value-balanced trade recommendations.

**Prerequisite (foundational):** the entire analyzer is built on FantasyCalc dynasty values, and **web has no values service**. Step 1 of this stub builds `PlayerValuesService` (web port of iOS `PlayerValuesStore`). Nothing else compiles without it. **Bonus:** this same service unblocks the draft grades deferred from s4 — call that out when s4's follow-up is scheduled.

**Biggest unknown:** iOS calls FantasyCalc directly from the device. The browser may be blocked by CORS. Resolving that is a **Phase 0 gate** (see below) and the single largest risk in this stub.

---

## Scope

### In scope
- **`PlayerValuesService`** — web port of `PlayerValuesStore`: FantasyCalc fetch + 12h session cache + `valueById` / `positionById` lookups + pick values by name + pick-year parsing + `pickNames(forYears)`.
- **`TeamAnalysisService`** — web port of `TeamAnalysisBuilder`: per-team hex axes (QB/RB/WR/TE/Bench/Taxi value sums), `axisMaxes`, `leagueAverageAxes`.
- **`RecommendedTradeService`** — web port of `RecommendedTradeBuilder` + `TradeEvaluator` (`evaluate`, `sideValue`, `suggestBalance`, `recommend`).
- **`TeamAnalyzerComponent`** — 3 tabs (Compare / League / Trade), anchored to the home league.
- **`HexagonChartComponent`** — hand-rolled SVG radar (grid rings, axis lines, up to 3 polygons: primary + comparison + dashed league-average baseline, normalized against `axisMaxes`).
- **`PositionBreakdownCard`** + **`RecommendedTradeCard`** web components.
- Route `/team-analyzer` (replace the existing placeholder redirect-to-`/team`); flip the sidebar `teamAnalyzer` entry off `placeholder`.

### Out of scope
- **Theme polish** — s10.
- **Backend work** — FantasyCalc is a public 3rd-party API. *Unless* CORS forces a proxy (see gate) — in which case a thin passthrough on the existing Xomper API Gateway is the fallback, flagged as a potential escalation.
- **My Team embed.** iOS embeds the analyzer inside My Team via `TradeAnalyzerController`. Web's My Team parity is a separate concern; **s8 ships the standalone analyzer page only.** Trade-builder state lives locally in the component, not a shared controller.
- **Sleeper roster-ownership validation of picks/players** — iOS v2 trusts the user; web mirrors that.

---

## iOS → web mapping

| iOS source | Web target | Data source |
|---|---|---|
| `PlayerValuesStore.swift` | `services/player-values.service.ts` | FantasyCalc `GET /values/current?isDynasty=true&numQbs=2&numTeams=12&ppr=1` |
| `TeamAnalysis.swift` (`TeamAnalysisBuilder`) | `services/team-analysis.service.ts` | `league.service` rosters+users + `player.service` positions + values service |
| `ProposedTrade.swift` (`TradeEvaluator`, `RecommendedTradeBuilder`) | `services/recommended-trade.service.ts` | analysis service + values service + rosters |
| `TeamAnalyzerView.swift` (3 tabs) | `pages/team-analyzer/team-analyzer.component.*` | the three services above |
| `HexagonChartView.swift` (Canvas radar) | `pages/team-analyzer/hexagon-chart/hexagon-chart.component.*` (SVG) | hex-axis arrays + axisMaxes |
| `PositionBreakdownCard.swift` | `pages/team-analyzer/position-breakdown-card/*` | analysis + averages + maxes |
| `RecommendedTradeCard.swift` | `pages/team-analyzer/recommended-trade-card/*` | a `RecommendedTrade` |

---

## FantasyCalc CORS / proxy note — READ FIRST

iOS hits `https://api.fantasycalc.com/values/current?...` directly with no auth. URLSession has no same-origin policy; a browser does. **The browser call from `xomper.xomware.com` may be rejected if FantasyCalc does not return `Access-Control-Allow-Origin`.**

**Finding (to confirm in Phase 0 gate, not assumed):** FantasyCalc's public `values/current` endpoint is widely consumed by browser-based dynasty tools and is generally observed to return permissive CORS headers (`Access-Control-Allow-Origin: *`) — it's a public read-only API with no credentials. **Working assumption: direct browser calls succeed, no proxy needed.** But this is the one thing that can derail the whole stub, so it must be *verified*, not trusted.

**If CORS blocks the call**, fallback options in order of preference:
1. **Angular dev-proxy** (`proxy.conf.json`) — unblocks local dev only; does **not** solve production. Insufficient alone.
2. **Xomper API Gateway passthrough** — add a thin `GET /fantasy-calc/values` Lambda that proxies the call server-side (mirrors the "future: move behind the Xomper API gateway" note in `PlayerValuesStore.swift`). This is **backend work** in `xomper-back-end` / `xomper-infrastructure` → **escalation / potential blocker**, since the epic declares no backend work. Surface immediately if the gate fails.

The `PlayerValuesService` must be written so the endpoint base URL is a single constant — swapping direct→proxy is a one-line change if the gate fails.

---

## Phase 0 / Pre-work

- [x] Create the s8 sub-issue under the epic; label `epic:web-ios-parity`. Branch `feature/<issue>-team-analyzer`.
- [x] Confirm no in-flight PR touches `app-routing.module.ts`, `sidebar.entries.ts`, or `team.service`/`league.service`.
- [x] **CORS GATE (blocking):** `access-control-allow-origin: *` confirmed on GET with Origin header. PASSES.

---

## Affected files

| File | Change |
|---|---|
| `src/app/services/player-values.service.ts` | **New** — FantasyCalc fetch + cache + lookups |
| `src/app/models/player-value.model.ts` | **New** — `PlayerValue` raw + mapped interfaces |
| `src/app/services/team-analysis.service.ts` | **New** — hex axes, maxes, averages |
| `src/app/services/recommended-trade.service.ts` | **New** — evaluate / suggestBalance / recommend |
| `src/app/models/team-analysis.model.ts` | **New** — `TeamAnalysis`, `HexAxis`, `TradeEvaluation`, `RecommendedTrade` |
| `src/app/pages/team-analyzer/team-analyzer.component.{ts,html,scss}` | **New** — 3-tab shell |
| `src/app/pages/team-analyzer/hexagon-chart/*` | **New** — SVG radar |
| `src/app/pages/team-analyzer/position-breakdown-card/*` | **New** |
| `src/app/pages/team-analyzer/recommended-trade-card/*` | **New** |
| `src/app/app-routing.module.ts` | Replace `team-analyzer → team` redirect (line 267) with the real component route, AuthGuard |
| `src/app/components/sidebar/sidebar.entries.ts` | Point Team Analyzer entry at `/team-analyzer`, drop `placeholder` |

---

## Implementation steps

1. [x] **`PlayerValuesService` + model (FIRST).** Port `PlayerValuesStore`: single 12h-cached `shareReplay(1)` fetch of FantasyCalc; build `valueById`, `positionById`, `pickValuesByName`, `pickYearsByName`; expose `value(id)`, `position(id)`, `pickValue(name)`, `pickNames(forYears)`, `allPickNames`, `hasValues`. Port `parseYearPrefix` (leading 4-digit token). Endpoint base URL as a single swappable constant (per CORS note). Verify a real fetch returns ~450 players + pick rows.
2. [x] **`TeamAnalysisService`.** Port `TeamAnalysisBuilder.build` (taxi excluded from position buckets; bench = not starter/reserve/taxi; FLEX/unknown → bench), `axisMaxes`, `leagueAverageAxes`. Feed from `league.service` rosters+users + `player.service` positions. Unit-spot-check axis sums against an iOS screenshot of one roster.
3. [x] **`RecommendedTradeService`.** Port `TradeEvaluator.evaluate` / `sideValue` / `suggestBalance` and `RecommendedTradeBuilder.recommend` verbatim — preserve the 5% `fairThreshold`, weak ≤0.85 / strong ≥1.05 bands, `myImprovement` cap, dedupe key, and `prefix(limit)` ranking. Port `TradeEvaluation.Verdict` labels.
4. [x] **`HexagonChartComponent` (SVG).** Hand-roll: 4 grid rings (0.25/0.5/0.75/1.0), 6 axis lines, vertex math (`angle = i·π/3 − π/2`, start top, clockwise), normalize each vertex by `axisMaxes[label]`, render dashed league-average polygon behind solid primary (gold) + comparison (cyan), dots on solid polygons only, axis labels at radius·1.18. `viewBox`-based, responsive.
5. [x] **`TeamAnalyzerComponent` shell + 3 tabs.** Tab bar (Compare/League/Trade); loading/error/empty states gated on `hasValues`; Compare tab (header, chart, legend, opponent dropdown sorted by total value desc, breakdown card); League tab (averages card + teams ranked by total value with per-axis bars normalized to league max, delta coloring gold≥1.05 / red≤0.85, YOU badge); Trade tab (partner picker, live evaluation strip + verdict pill, give/receive side cards with player+pick add/remove, balance suggestions, recommended-trades list). Trade state local to component.
6. [x] **`PositionBreakdownCard` + `RecommendedTradeCard`.** Port presentation 1:1 (structure, not theme — s10 styles later).
7. [x] **Routing + sidebar.** Replace the line-267 redirect with the real route under AuthGuard; flip the sidebar entry to `/team-analyzer`, remove `placeholder`.
8. [ ] **Smoke:** load page → chart renders for home team; switch opponent; League tab ranks 12 teams; Trade tab evaluates a manual trade and surfaces a recommendation; verify behind `?newShell=1` gate.
9. [x] **Build** (`ng build`) clean, no TS strict errors.
10. [ ] **`/ultrareview`** (D-A) before PR.
11. [ ] **Open PR(s)** with `Closes #<sub-issue>`, reference epic.

---

## Decisions to surface / answer

- **Chart tech → hand-rolled SVG (recommend, locked unless gate surprises).** Matches iOS's hand-drawn `Path` approach, zero new deps, full control over the dashed-baseline + dual-polygon overlay. A charting lib (`d3-shape`, ngx-charts) would be heavier and none ship a polar/radar primitive that fits cleanly. No dependency added.
- **FantasyCalc proxy approach → depends on CORS gate.** Direct browser call if the gate passes (assumed); Xomper API Gateway passthrough only if it fails (backend escalation).
- **PR split → recommend 2 PRs.** The data layer (Steps 1–3: three services + models, pure logic, independently testable) is substantial and self-contained. The visual layer (Steps 4–11: chart + 3-tab page + cards + routing) is the larger, review-heavier diff.
  - **PR 8a** — `PlayerValuesService` + `TeamAnalysisService` + `RecommendedTradeService` + models. Mergeable alone; also the piece that unblocks the deferred s4 draft grades.
  - **PR 8b** — `HexagonChartComponent`, `TeamAnalyzerComponent`, cards, routing, sidebar.
  - Smaller diffs suit the solo-maintainer `/ultrareview` model and give a clean revert point between data and view.

---

## Risks

- **CORS (biggest).** If FantasyCalc rejects browser calls, the whole stub stalls on a backend proxy that the epic says shouldn't exist. Mitigated by the Phase 0 gate + single swappable endpoint constant. Escalate immediately if the gate fails.
- **Chart-math port correctness.** Vertex angles, per-axis `axisMaxes` normalization, and the radius·1.18 label placement must match iOS exactly or the polygons read wrong. Mitigate by diffing the rendered shape against an iOS screenshot of the same roster.
- **Trade-eval algorithm fidelity.** `suggestBalance` band logic and `recommend`'s weak/strong/improvement-cap math are subtle. Port verbatim; verify with a known iOS trade producing the same verdict + suggestions.
- **Position resolution drift.** Web `player.service` `displayPosition` must match iOS `Player.displayPosition`, else bench/position buckets diverge. Spot-check.

---

## Open questions

- [ ] **CORS — potential user-facing blocker.** Does FantasyCalc return permissive CORS headers for `xomper.xomware.com`? Assumed yes; **must be confirmed in the Phase 0 gate.** A "no" converts s8 from frontend-only into frontend + a backend proxy PR (escalation).
- [ ] **Comparison/foreign-team scope.** iOS anchors to the home league only (`myLeagueRosters`). Confirm web s8 also ships home-league-only (no Search-reached foreign teams) — matching iOS keeps scope tight.

---

## Success criteria

1. `/team-analyzer` renders a hexagon radar for the home team; sidebar entry points to it (no longer a placeholder).
2. `PlayerValuesService` fetches FantasyCalc once per session, caches 12h, and exposes player + pick value lookups matching iOS.
3. Compare tab: opponent dropdown overlays a second polygon; league-average dashed baseline renders behind both.
4. League tab: 12 teams ranked by total value with per-axis bars + delta coloring + YOU badge, matching iOS.
5. Trade tab: live value totals + verdict pill, give/receive side editing, balance suggestions, and recommended trades — verdicts match the iOS algorithm.
6. Hex axes (QB/RB/WR/TE/Bench/Taxi sums), maxes, and averages match iOS `TeamAnalysisBuilder` output for the same league.
7. `ng build` clean; `/ultrareview` passes before PR.

---

## Next step

Complete the Phase 0 **CORS gate** first. If it passes, implement PR 8a (data services), then PR 8b (visual analyzer). If it fails, escalate the FantasyCalc proxy decision before writing Step 1.
