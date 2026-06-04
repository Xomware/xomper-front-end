# Plan: Web ↔ iOS Parity — s3 League Surface Split

**Status**: Draft
**Created**: 2026-06-04
**Epic**: [`../PLAN.md`](../PLAN.md)
**Brainstorm**: [`../BRAINSTORM.md`](../BRAINSTORM.md)

---

## TL;DR

Split `LeagueComponent`'s mega `activeTab` into separate route components: Standings, Matchups, Playoffs, World Cup, Rulebook, Scoring, League Settings, Payouts, Rule Proposals.

---

## iOS source surfaces

- `Xomper/Features/League/StandingsView.swift`
- `Xomper/Features/League/MatchupsView.swift`
- `Xomper/Features/League/PlayoffBracketView.swift`
- `Xomper/Features/League/WorldCupView.swift`
- `Xomper/Features/League/RulesView.swift` (covers Rulebook, Scoring, League Settings)
- `Xomper/Features/Payouts/PayoutsView.swift`
- (Rule Proposals) `Xomper/Features/League/RuleProposalFormView.swift` + list inside `RulesView`

## Web surfaces touched

- `pages/league/league.component.ts` (mega `activeTab` retired)
- New route components: `pages/standings`, `pages/matchups`, `pages/playoffs`, `pages/world-cup`, `pages/rulebook`, `pages/scoring`, `pages/league-settings`, `pages/payouts`, `pages/rule-proposals`
- `LEAGUE_RULES[5]` static HTML chunk → real `payouts.component` reading config
- `app.routes.ts` — register all new routes
- `services/league.service.ts`, `services/rules.service.ts` — reused as-is

---

## Dependencies

- **s1** (shell + nav rewrite) — sidebar entries for each new destination must exist before this split is reachable.

---

## Open questions for `/plan` to resolve

- [ ] **Shared chrome**: do the 9 new route components share a `LeagueShellComponent` (breadcrumb + season selector) or each own their own header? Affects whether season state is in a service or per-component.
- [ ] **`selected-league` parity**: each new route lives under `/league/...` for the home shell. Does the `selected-league` browse view get an equivalent split, or stay a single mega-tab for foreign leagues? Brainstorm leaves this open.
- [ ] **Per-season chip on Standings/Matchups**: iOS Standings now scopes to current season only with a chip to switch to past. Does web ship the chip now (s3) or defer to s10/follow-up?
- [ ] **Rule Proposals list ↔ Rulebook coupling**: iOS shows proposals inside Rules; we're splitting them. Where does the "Rules referenced by this proposal" link target — Rulebook anchor, or modal?

---

## Out of scope

- Draft tab restructure — s4 owns Draft.
- Draft Order Proposal route — s9 (separate from Rule Proposals, even though they share infra).
- Theme/visual polish — s10.
- Backend changes. None required.
- Building a new "Matchup History" page; per brainstorm, history dissolves into per-tab season chip (Archive dissolves).

---

## Backend contract dependencies

| New service(s) | Backend contract used | New backend work? |
|---|---|---|
| — (reuses existing services) | Sleeper API | No |

---

## Success criteria

- Nine separate routes exist under `/league/...` (or top-level, per planning), each rendering only its own surface.
- Sidebar entries from s1 link directly to the new routes (no more `activeTab` query param routing).
- `LeagueComponent`'s mega `activeTab` switch is deleted (or reduced to `selected-league` browse mode only — pending open question).
- Payouts is a real component reading from config, not a static HTML chunk inside `LEAGUE_RULES`.
- `selected-*` mode still works wherever the split touches it.

---

## Next step

Run `/plan s3-league-surface-split` to expand this skeleton into implementation-level detail.
