# Plan: Web ↔ iOS Parity — s7 Admin Portal

**Status**: Draft
**Created**: 2026-06-04
**Epic**: [`../PLAN.md`](../PLAN.md)
**Brainstorm**: [`../BRAINSTORM.md`](../BRAINSTORM.md)

---

## TL;DR

`AdminComponent` shell + 8 sub-screens in priority order (AI Review trigger → Test Email → Email Archive → Announcements CRUD → Tables → Audit → Cron → Logs deferred). Gates on Supabase `is_admin`.

---

## iOS source surfaces

- `Xomper/Features/Admin/AdminView.swift`
- `Xomper/Features/Admin/AIReviewSubScreen.swift`
- `Xomper/Features/Admin/AIReviewPreviewView.swift`
- `Xomper/Features/Admin/TestEmailView.swift`
- `Xomper/Features/Admin/EmailArchiveListView.swift`, `EmailArchiveDetailView.swift`
- `Xomper/Features/Admin/AnnouncementsListView.swift`, `AnnouncementEditView.swift`
- `Xomper/Features/Admin/UsersListView.swift`, `LeaguesListView.swift`, `UserEditView.swift`, `LeagueEditView.swift`, `TablesSubScreenView.swift`
- `Xomper/Features/Admin/AuditFeedView.swift`, `AuditDetailView.swift`
- `Xomper/Features/Admin/CronSettingsView.swift`
- `Xomper/Features/Admin/LogsView.swift` (placeholder — deferred per D-D)

## Web surfaces touched

- `pages/admin/admin.component.*` (shell with 8 sub-screens)
- New services: `admin.service`, `email-archive.service`, `tables.service`, `audit.service`, `cron.service`
- Extended service: `announcements.service` (gain write methods)
- `auth.guard.ts` — extend or add `admin.guard` for `is_admin` gating

---

## Dependencies

- **s5** (landing hub) — `announcements.service` skeleton (read) exists; this stub extends with writes.
- **s6** (AI Review hub) — `ai-review.service` exists; this stub adds the admin **trigger** + **preview** methods.
- (transitively) **s1** for the Admin sidebar section.

---

## Open questions for `/plan` to resolve

- [ ] **`is_admin` gate UX**: hide the entire Admin sidebar section for non-admins (iOS behavior), or show it disabled with a "you must be admin" tooltip? Hiding is cleaner; showing-disabled signals existence.
- [ ] **Sub-screen build order in a single PR vs. split**: epic plan lists 8 sub-screens in priority order. Do we ship one mega-PR (slow review, single revert point) or split into 7 sub-PRs all gated under `/admin/*`? Trade-off with D-A (`/ultrareview` per PR).
- [ ] **Email Archive resend recipient override**: brainstorm notes the Lambda endpoint must accept explicit recipient override — confirm contract status before scoping. If contract is missing, this becomes a blocker and `s7-email-archive` needs to slip.
- [ ] **Tables CRUD validation**: hand-rolled form validation vs. reactive forms vs. lightweight schema lib? Affects how quickly the 4 edit components ship.
- [ ] **Logs placeholder**: card with "deferred — read CloudWatch directly" copy, or hide entirely from sidebar? D-D says placeholder.

---

## Out of scope

- CloudWatch log tailing (Admin → Logs) — deferred per D-D, matches iOS state.
- Visual theme polish — s10.
- Backend changes. None required (per epic plan).
- Search-mode admin views (`selected-league` admin actions) — admin operates on home league only, matching iOS.

---

## Backend contract dependencies

| New service(s) | Backend contract used | New backend work? |
|---|---|---|
| `admin.service`, `email-archive.service`, `tables.service`, `audit.service`, `cron.service`; extends `announcements.service` | Lambda `POST /ai-review/trigger`, `POST /email/test-send`, `POST /email/resend`; Supabase `email_archive`, `whitelisted_users`, `whitelisted_leagues`, `audit_log`, `cron_settings`, `league_announcements` | No |

---

## Success criteria

- `/admin` renders the menu shell only for users where Supabase `is_admin = true`.
- 7 of 8 sub-screens are functional: AI Review trigger (with week override), Test Email, Email Archive list+detail+resend, Announcements CRUD, Tables (Users/Leagues), Audit feed+detail, Cron Settings.
- Logs sub-screen renders a placeholder card (no CloudWatch integration).
- Non-admin sidebar does not show the Admin section (decision pending — see open questions).
- AI Review trigger UI re-uses the broadcast preview pattern from `AIReviewPreviewView`.

---

## Next step

Run `/plan s7-admin-portal` to expand this skeleton into implementation-level detail.
