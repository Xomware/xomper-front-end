# Plan: Web ↔ iOS Parity — s7 Admin Portal

**Status**: In Progress (PR 7a complete, 7b pending)
**Created**: 2026-06-04
**Last updated**: 2026-06-04 (PR 7b shipped: issue #88, branch feature/88-admin-portal-b)
**Epic**: [`../PLAN.md`](../PLAN.md)
**Brainstorm**: [`../BRAINSTORM.md`](../BRAINSTORM.md)

---

## TL;DR

Ship the `/admin` shell plus 7 functional sub-screens (AI Review trigger + previews, Test Email, Email Archive list/detail/resend, Announcements CRUD, Tables Users/Leagues edit, Audit feed/detail, Cron Settings) and 1 deferred placeholder (Logs). All sub-screens are admin-gated via the new `AdminGuard` (which delegates to `SupabaseService.isAdmin`) and ship behind nested `/admin/*` routes. Split into two PRs (7a email-flows / 7b CRUD + ops) to keep review tractable.

---

## Approach

Mirror iOS `AdminView`'s sub-screen menu 1:1, but adapt the SwiftUI navigation push pattern to nested Angular routes (`/admin`, `/admin/ai-review`, `/admin/test-email`, …). Reuse `AiReviewService` (extend with admin write paths) and `AnnouncementsService` (extend with CRUD). Stand up 5 new services that wrap the Lambda + Supabase contracts iOS already exercises. Forms use Angular **Reactive Forms** (typed, testable). Destructive actions (Broadcast, Delete announcement, DNB toggle, Cron kill switch) gate behind a shared `ConfirmDialogComponent`. Pagination across Email Archive + Audit uses the s6 infinite-scroll pattern (`IntersectionObserver`-driven `loadMore()`).

Two PRs:

- **PR 7a** — Admin shell + AI Review sub-screen + Test Email + Email Archive list/detail/resend.
- **PR 7b** — Announcements CRUD + Tables (Users/Leagues + 2 edit forms) + Audit feed/detail + Cron Settings + Logs placeholder.

Recommend two PRs because each is ~1500+ LoC; a single 3000+ LoC PR is unreviewable solo.

---

## Scope

### In scope

**Shell + gating**
- `AdminComponent` at `/admin` — renders an 8-tile menu mirroring `AdminView.swift`. Logs tile renders disabled / muted styling per D-D.
- `AdminGuard` (new) — wraps `canActivate` on all `/admin/*` routes. Reads `SupabaseService.isAdmin$` (added s6), waits for `initialized$`, redirects non-admins to `/home`.
- Nested route registration in `app-routing.module.ts` under the existing `/admin` slot (currently a redirect-to-home stub).
- Promote sidebar Admin entry from `placeholder: true` to a real `/admin` route.

**7 functional sub-screens**
1. `AdminAiReviewComponent` (`/admin/ai-review`) — 4 trigger cards (post-draft / preseason / weekly w/ week stepper / week-preview w/ seasons-back + week stepper) + Test Sender card (`AdminTestKind` buttons) + filter bar (channel + status segmented) + activity feed (last 7d). Tapping "View N previews" pushes `/admin/ai-review/preview/:type`.
2. `AdminAiReviewPreviewComponent` (`/admin/ai-review/preview/:type`) — Pre-broadcast preview list. Header card + DNB lock row (toggles `do_not_broadcast` flag) + "Broadcast to all N" button (gold capsule, custom confirm dialog) + recipients `LazyVStack`-equivalent. Tapping a recipient opens a detail modal rendering subject + markdown body.
3. `AdminTestEmailComponent` (`/admin/test-email`) — Kind picker (TestEmailKind enum), recipient picker (whitelisted users), report picker (latest-by-type, shown only for AI Review kinds), Send button, success/error toast, last-7d email receipts.
4. `AdminEmailArchiveListComponent` (`/admin/email-archive`) — Cursor-paginated archive list (template chip + subject + recipient + sent-at). Infinite scroll. Tapping a row routes to detail.
5. `AdminEmailArchiveDetailComponent` (`/admin/email-archive/:id`) — Metadata card + sandboxed HTML preview (`<iframe sandbox="">` mirroring iOS WKWebView no-JS) + resend form (typed-in recipient) hitting `POST /email/resend`.
6. `AdminAnnouncementsListComponent` (`/admin/announcements`) — Lists every row (active + inactive + expired) with chip states. "+ New" button → edit (no id). Swipe-equivalent: row-trailing delete button → confirm dialog → soft-delete.
7. `AdminAnnouncementEditComponent` (`/admin/announcements/:id` or `/admin/announcements/new`) — Reactive form (title, body, priority info/critical, isActive, displayOrder, hasExpiry + expiresAt datetime). Update path sends only changed fields (matches iOS diff-and-send).
8. Tables sub-tree:
   - `AdminTablesMenuComponent` (`/admin/tables`) — 2 tiles: Users, Leagues. (iOS has a 3rd "Reports flags" tile that just deep-links to AI Review's redact menu — web mirrors by adding a 3rd tile that routes to `/ai-review` with a tooltip "flags live on each report row".)
   - `AdminTablesUsersComponent` (`/admin/tables/users`) — Lists whitelisted users with role + active chips.
   - `AdminUserEditComponent` (`/admin/tables/users/:id`) — Reactive form (email + display_name + isAdmin + isActive). Email regex validator mirroring iOS `AdminValidation.emailRegex`. Diff-on-save.
   - `AdminTablesLeaguesComponent` (`/admin/tables/leagues`) — Lists whitelisted leagues with active/dynasty/taxi chips.
   - `AdminLeagueEditComponent` (`/admin/tables/leagues/:id`) — Reactive form (leagueName + isActive + isDynasty + hasTaxi). League ID + season are read-only labels.
9. `AdminAuditFeedComponent` (`/admin/audit`) — Cursor-paginated audit feed. Empty-state branches: tableMissing → migration message; empty → "no entries yet"; error → retry.
10. `AdminAuditDetailComponent` (`/admin/audit/:id`) — Resolves entry from in-memory store (no separate detail endpoint per iOS). Header card + 3 collapsible JSON blocks (Before / After / Metadata).
11. `AdminCronSettingsComponent` (`/admin/cron-settings`) — Per-row enabled/test-mode toggle pair. "Test mode active" gold banner when any row has `testMode: true`. Per-row pending spinner during in-flight save.

**1 placeholder**
- `AdminLogsComponent` (`/admin/logs`) — Empty state card: terminal icon, "CloudWatch logs coming soon", "Tail logs in the AWS console for now". No fetch logic, no store.

**Service surfaces**

Extends to existing:
- `AiReviewService` gains `trigger(opts)`, `setReportFlag(report, flag, value)`. (Preview list rides on the dry-run response shape — no separate endpoint.)
- `AnnouncementsService` gains `listAdmin()`, `getById(id)`, `create(input)`, `update(id, fieldsDiff)`, `softDelete(id)`.

New services:
- `AdminService` — umbrella for `listNotifications(opts)`, `testSend(opts)`, `listEmailTestRecipients()`. Wraps `/admin/notifications`, `/admin/test-send`, `/admin/email-test-recipients`.
- `EmailArchiveService` — `list(cursor)`, `getById(id)`, `resend(id, toEmail)`. Wraps `/admin/emails-list`, `/admin/emails-get`, `/admin/emails-resend`.
- `TablesService` — `listUsers()`, `updateUser(id, diff)`, `listLeagues()`, `updateLeague(id, diff)`. Wraps `/admin/users-list`, `/admin/users-update`, `/admin/leagues-list`, `/admin/leagues-update`.
- `AuditService` — `list(cursor)`. Wraps `/admin/audit-list`. (Detail uses in-memory cache; no second endpoint.)
- `CronService` — `list()`, `setEnabled(cronKey, enabled)`, `setTestMode(cronKey, testMode)`. Wraps `/admin/cron-list` + `/admin/cron-update`.

### Out of scope

- CloudWatch Logs tail UI (D-D — Logs is a placeholder tile only).
- Backend changes — every endpoint already exists and is exercised by iOS today (per epic Q3).
- Midnight Emerald theme polish — s10 sweep.
- Search-mode admin views (admin operates on home league only per Q1 hybrid).
- Push to background tests, server-driven preview persistence — preview state is in-memory per-session, mirroring iOS `AdminStore.lastPreviewsByType`.
- AI Review hub list/detail (already shipped s6).

---

## Sub-screens × what each requires

### 1. AI Review (`/admin/ai-review`)

- **iOS source**: `AIReviewSubScreen.swift` (~999 LoC), `AdminStore.swift` (trigger + previews state).
- **Web component**: `pages/admin/ai-review/admin-ai-review.component.ts`.
- **Services**: `AiReviewService.trigger(type, { dryRun, force, week?, seasonsBack? })` (new), `AdminService.listNotifications` (new), `AdminService.testSend` (new).
- **Backend**: Lambdas `POST /ai-review/trigger`, `GET /admin/notifications`, `POST /admin/test-send`.
- **Risks**:
  - 4 trigger cards × ~150 LoC each = the largest single component. Plan keeps them as one component with helper render methods (not 4 sub-components) to match iOS shape.
  - Week-preview seasons-back toggle is novel — straightforward but easy to forget the "omit key when 0" wire rule (iOS sends `null` only when > 0).
  - Preview state is per-session in-memory — refreshing the browser loses it. Match iOS (no persistence). Document in component header.
- **Est. LoC**: 600–750.

### 2. AI Review Preview (`/admin/ai-review/preview/:type`)

- **iOS source**: `AIReviewPreviewView.swift` (~520 LoC).
- **Web component**: `pages/admin/ai-review/preview/admin-ai-review-preview.component.ts` + nested detail modal.
- **Services**: `AiReviewService.setReportFlag(report, 'do_not_broadcast', value)` (new), `AiReviewService.trigger(...)` (reused for broadcast).
- **Backend**: Lambdas `POST /ai-review/report-flag`, `POST /ai-review/trigger`.
- **Risks**:
  - `:type` param must be one of 4 enum values — validate in resolver / component init and bounce to `/admin/ai-review` on mismatch.
  - Markdown rendering — use `marked` (already in deps if present) or hand-roll a minimal renderer; iOS uses `AttributedString(markdown:)`.
  - DNB write race — disable toggle while in-flight (iOS pattern with `dnbInFlight`).
- **Est. LoC**: 350–450.

### 3. Test Email (`/admin/test-email`)

- **iOS source**: `TestEmailView.swift` (~482 LoC), `TestEmailStore.swift` (read but not exhaustively).
- **Web component**: `pages/admin/test-email/admin-test-email.component.ts`.
- **Services**: `AdminService.listEmailTestRecipients()` (new), `AdminService.sendTestEmail(opts)` (new), `AiReviewService.fetchLatest(type)` × 3 (reuse private method or expose as `getLatest(type)`).
- **Backend**: Lambdas `GET /admin/email-test-recipients`, `POST /email/test-send`, `GET /ai-reports/latest`.
- **Risks**:
  - `TestEmailKind` enum is large (lineup_not_set, weekly_recap, close_game_alert, world_cup_*, rule_*, taxi_steal, plus AI Review kinds). Mirror exhaustively or scope down — recommend mirror exhaustively to match iOS.
  - Conditional Report picker (only shown when kind isAIReview) needs a clean reactive form pattern with `valueChanges` driving conditional control visibility.
- **Est. LoC**: 350–450.

### 4. Email Archive List (`/admin/email-archive`)

- **iOS source**: `EmailArchiveListView.swift` (~116 LoC), `EmailArchiveStore.swift`.
- **Web component**: `pages/admin/email-archive/list/admin-email-archive-list.component.ts`.
- **Services**: `EmailArchiveService.list(cursor?)` (new).
- **Backend**: Lambda `GET /admin/emails-list`.
- **Risks**:
  - Cursor pagination via `IntersectionObserver` — reuse s6 pattern. Be careful about double-fire on fast scroll.
  - ISO-8601 fractional seconds parser must accept both with and without `.SSS` (iOS uses both formatters).
- **Est. LoC**: 200–250.

### 5. Email Archive Detail (`/admin/email-archive/:id`)

- **iOS source**: `EmailArchiveDetailView.swift` (~216 LoC).
- **Web component**: `pages/admin/email-archive/detail/admin-email-archive-detail.component.ts`.
- **Services**: `EmailArchiveService.getById(id)` (new), `EmailArchiveService.resend(id, toEmail)` (new).
- **Backend**: Lambdas `GET /admin/emails-get`, `POST /admin/emails-resend`.
- **Risks**:
  - HTML preview sandboxing — use `<iframe sandbox srcdoc="...">` with no allow- attributes. Need `DomSanitizer.bypassSecurityTrustHtml` or write the doc via JS to a same-origin iframe.
  - Resend recipient override — brainstorm flagged this as a contract-status concern. Verify the Lambda accepts `to_email` in body before scoping; if missing, escalate (see Risks below).
- **Est. LoC**: 250–300.

### 6. Announcements List (`/admin/announcements`)

- **iOS source**: `AnnouncementsListView.swift` (~270 LoC), `AnnouncementsStore.swift`.
- **Web component**: `pages/admin/announcements/list/admin-announcements-list.component.ts`.
- **Services**: `AnnouncementsService.listAdmin()` (new), `AnnouncementsService.softDelete(id)` (new).
- **Backend**: Supabase `league_announcements` table (admin read uses Lambda `GET /admin/announcements-list`; delete uses `POST /admin/announcements-delete`).
- **Risks**:
  - `tableMissing` branch — backend signals via response shape; mirror iOS dedicated empty state.
  - Pending-id set on the store needs to render row-level spinner consistently with iOS.
- **Est. LoC**: 250–300.

### 7. Announcement Edit (`/admin/announcements/:id` and `/admin/announcements/new`)

- **iOS source**: `AnnouncementEditView.swift` (~281 LoC).
- **Web component**: `pages/admin/announcements/edit/admin-announcement-edit.component.ts`.
- **Services**: `AnnouncementsService.create(input)`, `AnnouncementsService.update(id, diff)`.
- **Backend**: Lambdas `POST /admin/announcements-create`, `POST /admin/announcements-update`.
- **Risks**:
  - 3-state expiry transition (on→off → null, off→on → date, on→on if changed) must be mirrored exactly so the backend's diff-audit log stays tight.
  - Markdown body field — `<textarea>` with the same "Supports **bold** and [links]" hint copy.
- **Est. LoC**: 300–400.

### 8. Tables Users List + Edit (`/admin/tables/users`, `/admin/tables/users/:id`)

- **iOS source**: `UsersListView.swift` + `UserEditView.swift` + `AdminTablesStore.swift`.
- **Web components**: `pages/admin/tables/users/list/admin-tables-users.component.ts`, `pages/admin/tables/users/edit/admin-user-edit.component.ts`.
- **Services**: `TablesService.listUsers()`, `TablesService.updateUser(id, diff)`.
- **Backend**: Lambdas `GET /admin/users-list`, `POST /admin/users-update`.
- **Risks**:
  - Email regex must match iOS `AdminValidation.emailRegex` exactly (same RFC5322-simplified shape) so the backend never sees a request the iOS form would have caught.
  - Updates use `updateKey` (iOS field) — confirm which Supabase column that maps to (likely `email` or `sleeper_user_id`) before wiring.
- **Est. LoC**: 350–450 combined.

### 9. Tables Leagues List + Edit (`/admin/tables/leagues`, `/admin/tables/leagues/:id`)

- **iOS source**: `LeaguesListView.swift` + `LeagueEditView.swift`.
- **Web components**: `pages/admin/tables/leagues/list/admin-tables-leagues.component.ts`, `pages/admin/tables/leagues/edit/admin-league-edit.component.ts`.
- **Services**: `TablesService.listLeagues()`, `TablesService.updateLeague(id, diff)`.
- **Backend**: Lambdas `GET /admin/leagues-list`, `POST /admin/leagues-update`.
- **Risks**: Diff-on-save shape identical to Users — copy-pattern.
- **Est. LoC**: 300–350 combined.

### 10. Audit Feed (`/admin/audit`) + Detail (`/admin/audit/:id`)

- **iOS source**: `AuditFeedView.swift` + `AuditDetailView.swift`.
- **Web components**: `pages/admin/audit/feed/admin-audit-feed.component.ts`, `pages/admin/audit/detail/admin-audit-detail.component.ts`.
- **Services**: `AuditService.list(cursor?)` (new).
- **Backend**: Lambda `GET /admin/audit-list`.
- **Risks**:
  - In-memory resolution for detail — if the user reloads `/admin/audit/:id` directly with an empty store, fall back to `auditService.list(null)` and search the first page (iOS doesn't handle this case; web should because URLs are bookmarkable).
  - Pretty-printed JSON blocks — use `JSON.stringify(value, null, 2)` inside a `<pre>` with monospace font.
- **Est. LoC**: 350–400 combined.

### 11. Cron Settings (`/admin/cron-settings`)

- **iOS source**: `CronSettingsView.swift` (~244 LoC), `CronSettingsStore.swift`.
- **Web component**: `pages/admin/cron-settings/admin-cron-settings.component.ts`.
- **Services**: `CronService.list()`, `CronService.setEnabled(cronKey, enabled)`, `CronService.setTestMode(cronKey, testMode)`.
- **Backend**: Lambdas `GET /admin/cron-list`, `POST /admin/cron-update`.
- **Risks**:
  - "Test mode active" banner is a real safety net (admin forgot to flip back). Make sure it sticks at the top of the scroll view, not in-flow.
  - Test-mode toggle must be disabled when enabled=false (iOS UX rule).
- **Est. LoC**: 250–300.

### 12. Logs placeholder (`/admin/logs`)

- **iOS source**: `LogsView.swift` (functional on iOS; mirroring as **placeholder** per D-D).
- **Web component**: `pages/admin/logs/admin-logs.component.ts`.
- **Services**: none.
- **Backend**: none.
- **Risks**: None — pure static empty state.
- **Est. LoC**: 30–50.

---

## New service surfaces (method signatures)

Shapes derived from iOS `XomperAPIClient.swift` + each iOS store. Pseudocode-level — actual TS types land in `models/`.

```ts
// AdminService
listNotifications(opts: { sleeperUserId: string; daysBack?: number; kind?: 'push'|'email'; status?: 'success'|'failure'; limit?: number }): Observable<AdminNotificationLogResponse>
listEmailTestRecipients(): Observable<TestEmailRecipient[]>
sendTestEmail(opts: { sleeperUserId: string; kind: TestEmailKind; reportId?: string; recipientEmail: string }): Observable<TestEmailResponse | TestEmailTemplateResponse>
sendTestPush(opts: { sleeperUserId: string; kind: AdminTestKind; channels: ('push'|'email')[]; email?: string }): Observable<{ pushSent: boolean; emailSent: boolean }>

// EmailArchiveService
list(cursor?: string | null): Observable<{ rows: EmailArchiveEntry[]; nextCursor: string | null }>
getById(id: string): Observable<EmailArchiveEntry | null>
resend(id: string, toEmail: string): Observable<{ recipientEmail: string; messageId?: string }>

// TablesService
listUsers(): Observable<WhitelistedUser[]>
updateUser(updateKey: string, fields: Record<string, AdminFieldValue>): Observable<{ updated: WhitelistedUser }>
listLeagues(): Observable<WhitelistedLeague[]>
updateLeague(leagueId: string, fields: Record<string, AdminFieldValue>): Observable<{ updated: WhitelistedLeague }>

// AuditService
list(cursor?: string | null): Observable<{ rows: AuditEntry[]; nextCursor: string | null; tableMissing?: boolean }>

// CronService
list(): Observable<{ rows: CronSetting[]; tableMissing?: boolean }>
setEnabled(cronKey: string, enabled: boolean): Observable<CronSetting>
setTestMode(cronKey: string, testMode: boolean): Observable<CronSetting>

// AiReviewService — additions
trigger(type: AiReportType, opts: { dryRun: boolean; force: boolean; week?: number; seasonsBack?: number }): Observable<AiReviewTriggerResponse>
setReportFlag(report: AiReport, flag: 'do_not_broadcast'|'redact', value: boolean): Observable<{ metadata: Record<string, string> }>
getLatest(type: AiReportType): Observable<AiReport | null>  // promote private fetchLatest → public

// AnnouncementsService — additions
listAdmin(): Observable<{ rows: LeagueAnnouncement[]; tableMissing?: boolean }>
getById(id: string): Observable<LeagueAnnouncement | null>  // resolves from listAdmin cache
create(input: AnnouncementCreateInput): Observable<LeagueAnnouncement>
update(id: string, fields: Record<string, AdminFieldValue>): Observable<LeagueAnnouncement>
softDelete(id: string): Observable<void>
```

`AdminFieldValue` is a discriminated union mirroring iOS `AdminFieldValue` enum: `{ kind: 'string'; value: string } | { kind: 'bool'; value: boolean } | { kind: 'int'; value: number } | { kind: 'null' }`.

---

## Phase 0 pre-work

- [ ] **Open epic sub-issue**: `s7-admin-portal` with `epic:web-ios-parity` label. Link to epic issue.
- [ ] **Confirm no in-flight PRs** touching `app-routing.module.ts`, `sidebar.entries.ts`, `ai-review.service.ts`, `announcements.service.ts`, `supabase.service.ts`.
- [ ] **Verify Supabase RLS allows admin reads** on `whitelisted_users`, `whitelisted_leagues`, `audit_log`, `cron_settings`, `email_archive`, `league_announcements` for the authenticated admin role. If RLS is restrictive and only the service role can SELECT, the web client can't read these directly — all reads must go through the Lambda layer. **This is the case per iOS today** (every list goes through `/admin/...` Lambdas), so just confirm and proceed; if any read attempts to use the Supabase JS client directly, that's a bug.
- [ ] **Branch**: `feature/<sub-issue>-s7-admin-shell` (PR 7a) and `feature/<sub-issue>-s7-admin-crud` (PR 7b).
- [ ] **Resolve open question on Logs visibility** — see Open Questions.

---

## Affected files / components

### NEW (PR 7a — shell + email-flow)

| File | Purpose |
|---|---|
| `src/app/guards/admin.guard.ts` | `canActivate` admin gate. |
| `src/app/pages/admin/admin.component.ts/html/scss` | 8-tile menu shell. |
| `src/app/pages/admin/ai-review/admin-ai-review.component.{ts,html,scss}` | Trigger cards + activity feed. |
| `src/app/pages/admin/ai-review/preview/admin-ai-review-preview.component.{ts,html,scss}` | Pre-broadcast preview list. |
| `src/app/pages/admin/ai-review/preview/admin-ai-review-preview-detail.component.{ts,html,scss}` | Per-recipient detail modal. |
| `src/app/pages/admin/test-email/admin-test-email.component.{ts,html,scss}` | Test email sub-screen. |
| `src/app/pages/admin/email-archive/list/admin-email-archive-list.component.{ts,html,scss}` | Archive list. |
| `src/app/pages/admin/email-archive/detail/admin-email-archive-detail.component.{ts,html,scss}` | Archive detail + resend. |
| `src/app/services/admin.service.ts` | Notifications + test-send + test-recipients. |
| `src/app/services/email-archive.service.ts` | Archive list/detail/resend. |
| `src/app/models/admin-notification-log.model.ts` | Notification entry types. |
| `src/app/models/email-archive.model.ts` | Archive entry + detail types. |
| `src/app/models/test-email.model.ts` | TestEmailKind enum + recipient + response types. |
| `src/app/models/ai-review-trigger.model.ts` | Trigger request + response (incl. previews). |
| `src/app/models/admin-field-value.model.ts` | `AdminFieldValue` discriminated union. |
| `src/app/components/confirm-dialog/confirm-dialog.component.{ts,html,scss}` | Shared destructive-action confirm. |

### NEW (PR 7b — CRUD + ops)

| File | Purpose |
|---|---|
| `src/app/pages/admin/announcements/list/admin-announcements-list.component.{ts,html,scss}` | CRUD list. |
| `src/app/pages/admin/announcements/edit/admin-announcement-edit.component.{ts,html,scss}` | CRUD edit form. |
| `src/app/pages/admin/tables/admin-tables-menu.component.{ts,html,scss}` | 2-tile Users/Leagues menu (3-tile w/ Reports flags deep link). |
| `src/app/pages/admin/tables/users/list/admin-tables-users.component.{ts,html,scss}` | Users list. |
| `src/app/pages/admin/tables/users/edit/admin-user-edit.component.{ts,html,scss}` | User edit form. |
| `src/app/pages/admin/tables/leagues/list/admin-tables-leagues.component.{ts,html,scss}` | Leagues list. |
| `src/app/pages/admin/tables/leagues/edit/admin-league-edit.component.{ts,html,scss}` | League edit form. |
| `src/app/pages/admin/audit/feed/admin-audit-feed.component.{ts,html,scss}` | Audit feed. |
| `src/app/pages/admin/audit/detail/admin-audit-detail.component.{ts,html,scss}` | Audit detail (JSON blocks). |
| `src/app/pages/admin/cron-settings/admin-cron-settings.component.{ts,html,scss}` | Cron settings. |
| `src/app/pages/admin/logs/admin-logs.component.{ts,html,scss}` | Logs placeholder. |
| `src/app/services/tables.service.ts` | Users/Leagues CRUD. |
| `src/app/services/audit.service.ts` | Audit list. |
| `src/app/services/cron.service.ts` | Cron list + toggle. |
| `src/app/models/whitelisted-user.model.ts` | Admin-scope user model (existing public model may not be enough). |
| `src/app/models/whitelisted-league.model.ts` | League admin model. |
| `src/app/models/audit-entry.model.ts` | Audit row + JSON value helper. |
| `src/app/models/cron-setting.model.ts` | Cron row + toggle response. |
| `src/app/models/admin-validation.ts` | Shared email regex helper. |

### EDIT

| File | Change |
|---|---|
| `src/app/app-routing.module.ts` | Add `/admin` + 13 nested child routes (both PRs). |
| `src/app/components/sidebar/sidebar.entries.ts` | Flip `Admin` entry `placeholder: false`. |
| `src/app/services/ai-review.service.ts` | Add `trigger()`, `setReportFlag()`, expose `getLatest()`. |
| `src/app/services/announcements.service.ts` | Add `listAdmin()`, `getById()`, `create()`, `update()`, `softDelete()`. |
| `src/app/models/league-announcement.model.ts` | Add admin response types + create/update payloads. |
| `src/app/models/ai-report.model.ts` | Add `doNotBroadcast`, `redact` flag accessors if not already present. |

### DELETE
- None.

---

## Implementation steps

Sequenced. Steps 1–4 are Phase 0 / shared. Steps 5–17 are PR 7a. Steps 18–34 are PR 7b. Step 35 is final.

**Phase 0 (shared, lands in PR 7a)**

- [x] 1. Open `s7-admin-portal` sub-issue; confirm no conflicting in-flight PRs.
- [x] 2. Add `AdminGuard` (`canActivate` waits for `SupabaseService.initialized$`, then checks `isAdmin$`).
- [x] 3. Add `AdminFieldValue` model + shared `ConfirmDialogComponent`.
- [x] 4. Promote sidebar Admin entry `placeholder: false`; flip `route` to `/admin`.

**PR 7a — Shell + Email flows**

- [x] 5. Build `AdminComponent` shell (8 tiles, Logs disabled-styled).
- [x] 6. Wire `/admin` route with `AdminGuard`.
- [x] 7. Extend `AiReviewService`: add `getLatest(type)` public surface; add `trigger(type, opts)`; add `setReportFlag(report, flag, value)`; extend response model with `previews`.
- [x] 8. Add `AdminService` + models (notifications, test-send, test-recipients).
- [x] 9. Build `AdminAiReviewComponent` (4 trigger cards + test-sender + filters + activity feed). Wire trigger button → service → previews state → "View N previews" link.
- [x] 10. Build `AdminAiReviewPreviewComponent` (header card, DNB lock row, broadcast confirm via `ConfirmDialogComponent`, recipients list).
- [x] 11. Build `AdminAiReviewPreviewDetailComponent` modal (markdown body render; embedded in preview component).
- [x] 12. Wire `/admin/ai-review` and `/admin/ai-review/preview/:type` routes.
- [x] 13. Build `AdminTestEmailComponent` (kind/recipient/report pickers via Reactive Forms; conditional report visibility).
- [x] 14. Wire `/admin/test-email` route.
- [x] 15. Add `EmailArchiveService` + models.
- [x] 16. Build `AdminEmailArchiveListComponent` (infinite-scroll cursor pagination).
- [x] 17. Build `AdminEmailArchiveDetailComponent` ([innerHTML] sanitized HTML preview, resend form). Note: used [innerHTML] not iframe per plan operational rules.
- [x] 17a. Wire `/admin/email-archive` and `/admin/email-archive/:id` routes.
- [x] 17b. /ultrareview unavailable in this environment — skipped, noted in EXECUTION_LOG. PR opened below.

**PR 7b — CRUD + Ops**

- [x] 18. Extend `AnnouncementsService`: add `listAdmin()`, `getById()`, `create()`, `update()`, `softDelete()`.
- [x] 19. Build `AdminAnnouncementsListComponent` (chips, delete confirm, pending spinner).
- [x] 20. Build `AdminAnnouncementEditComponent` (Reactive Form, 3-state expiry diff).
- [x] 21. Wire `/admin/announcements` and `/admin/announcements/:id` (incl. `new` sentinel) routes.
- [x] 22. Add `TablesService` + `WhitelistedUser` (admin-scope) + `WhitelistedLeague` models.
- [x] 23. Build `AdminTablesMenuComponent`.
- [x] 24. Build `AdminTablesUsersComponent` + `AdminUserEditComponent` (email regex validator + diff-on-save).
- [x] 25. Build `AdminTablesLeaguesComponent` + `AdminLeagueEditComponent`.
- [x] 26. Wire `/admin/tables`, `/admin/tables/users`, `/admin/tables/users/:id`, `/admin/tables/leagues`, `/admin/tables/leagues/:id` routes.
- [x] 27. Add `AuditService` + `AuditEntry` model.
- [x] 28. Build `AdminAuditFeedComponent` (cursor pagination + tableMissing empty state).
- [x] 29. Build `AdminAuditDetailComponent` (3 collapsible JSON blocks; first-page fallback when store empty on direct nav).
- [x] 30. Wire `/admin/audit` and `/admin/audit/:id` routes.
- [x] 31. Add `CronService` + `CronSetting` model.
- [x] 32. Build `AdminCronSettingsComponent` (test-mode banner, per-row pending spinner).
- [x] 33. Wire `/admin/cron-settings` route.
- [x] 34. Build `AdminLogsComponent` placeholder + wire `/admin/logs` route.
- [ ] 34a. Run `/ultrareview` on PR 7b; open PR.
- [ ] 35. Both PRs merged → mark `s7-admin-portal` sub-issue done on XomBoard.

---

## Decisions

| # | Decision | Recommendation |
|---|---|---|
| D-1 | Single PR vs split | **Split into PR 7a (shell + email flows) + PR 7b (CRUD + ops).** Each ~1500 LoC; single 3000+ is unreviewable solo. Natural pause point after 7a (email iteration is the highest-value admin loop). |
| D-2 | Admin shell layout | **Nested sub-routes** (`/admin/ai-review`, etc.). Matches s3 nested-children pattern, gives bookmarkable URLs, and keeps each component focused on one screen. |
| D-3 | Form library | **Angular Reactive Forms** (typed). Matches Angular 18 best practice; testable; diff-on-save is trivial via `dirty` flags or explicit field comparison. |
| D-4 | Destructive-action confirm | **Custom `ConfirmDialogComponent`** (shared). Better mobile UX than native `confirm()`, can show context (counts, names), reusable across 5+ destructive flows. |
| D-5 | Pagination | **Infinite scroll** via `IntersectionObserver`, matching s6 pattern. Used by Email Archive + Audit. |
| D-6 | Logs visibility | See Open Questions — recommend **tile visible but disabled / muted styling** (signals existence + roadmap). |

---

## Risks

- **Scope creep** — 8 sub-screens is a lot of surface to gold-plate. Plan must be ruthless about "match iOS shape, no extra polish". Theme work belongs to s10, not here.
- **Service-creation churn** — 5 new services × 2–4 methods each + 6 new HTTP wrappers. Mitigation: lock the service template after the first one (`AdminService`) and copy-pattern for the rest. All follow `HttpClient` + `Bearer` header + `map(mapDto)` shape.
- **RLS as silent blocker** — if Supabase RLS rejects admin reads on `whitelisted_users` / `audit_log` / `cron_settings` for the authenticated role (vs the service role), the web client can't read them directly. Mitigation: every list goes through a Lambda (matches iOS); no direct Supabase reads from the admin components. Verified in Phase 0 step 3.
- **Cron toggle real-world side-effect** — flipping `enabled: false` actually kills the cron in production. Mitigation: confirm-dialog every cron toggle change. The iOS view doesn't confirm but iOS is a single trusted admin; web should be conservative because the admin role may grow.
- **Email Archive resend recipient override** — brainstorm flagged this as a contract dependency. If `/admin/emails-resend` doesn't accept `to_email`, the resend form is dead. Mitigation: validate the contract in Phase 0 by tailing the iOS Lambda call; if missing, escalate and move resend to PR 7b (deferred) instead of slipping all of 7a.
- **PR size — even split, each is large** — both PRs hit 1500+ LoC. Mitigation: tight self-review with `/ultrareview` before opening each PR. Reviewer (solo) gets two distinct chunks instead of one wall.
- **Admin guard race on cold load** — `SupabaseService.isAdmin` is hydrated async via `loadWhitelistedUser`. If the guard reads `isAdmin` before `_whitelistedUser` resolves, it returns false → redirect to `/home`. Mitigation: guard MUST wait for `initialized$` then read `isAdmin$` (Observable), not the synchronous `isAdmin` getter.
- **`/admin/audit/:id` direct nav with empty store** — iOS resolves from the in-memory `auditEntries` list; web users will bookmark detail URLs and hit the route cold. Mitigation: detail component falls back to `auditService.list(null)` and searches the first page; if not found, "entry not found" empty state.

---

## Open questions

- [ ] **Logs tile visibility**: hide entirely from the admin menu (cleanest — no dead tile), or render disabled / muted (signals roadmap)? Recommendation: render disabled with "Coming soon" copy in the subtitle. Matches D-D intent (mirror iOS stub state) better than hiding.
- [ ] **Cron Settings under D-D or fair game?** D-D mentions Logs as deferred but Cron Settings touches live cron behavior. Confirm Cron is in scope for v1 (iOS ships it functional; web should mirror — but worth double-checking before committing to the live-mutation path).

---

## Success criteria

- `/admin` renders 8 tiles only when `SupabaseService.isAdmin === true`; non-admins redirect to `/home`.
- AI Review trigger fires `/ai-review/trigger` for all 4 types, populates per-type previews state, and pushes to `/admin/ai-review/preview/:type` on "View N previews" tap.
- Broadcast button on the preview screen disables when `do_not_broadcast` is set, and the DNB toggle persists across re-entry to the screen.
- Test Email sends successfully via the kind picker for both AI Review and template kinds; receipts list refreshes within 1s of send.
- Email Archive list infinite-scrolls past page 1; detail renders the HTML body in a sandboxed iframe; Resend hits `/admin/emails-resend` with the typed-in recipient.
- Announcements CRUD: create round-trips a row; update sends only changed fields (verified via DevTools); soft-delete hides the row from `/home` immediately.
- Tables Users + Leagues lists render the Supabase rows; edit forms diff-on-save; email validation matches iOS regex.
- Audit feed paginates; detail renders Before/After/Metadata JSON blocks.
- Cron Settings list renders; toggling `enabled` and `testMode` round-trips; "Test mode active" banner appears when any row has testMode=true.
- Logs tile renders placeholder copy and does NOT navigate (or navigates to a placeholder screen with "Coming soon" only).

---

## Next step

Flip status to `Ready`, then:

```
/execute s7-admin-portal
```

Recommend running `/execute` twice — once for PR 7a steps (1–17b), then again for PR 7b steps (18–35) after 7a merges. Each `/execute` should preview which agents are queued (Reactive Forms patterns, RLS audit, service template scaffolding).
