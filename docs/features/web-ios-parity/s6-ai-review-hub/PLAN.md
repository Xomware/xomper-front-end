# Plan: Web ↔ iOS Parity — s6 AI Review Hub

**Status**: Draft
**Created**: 2026-06-04
**Epic**: [`../PLAN.md`](../PLAN.md)
**Brainstorm**: [`../BRAINSTORM.md`](../BRAINSTORM.md)

---

## TL;DR

Build `AIReviewListComponent` + `AIReviewDetailComponent`; extends the `ai-review.service` introduced in stub 5.

---

## iOS source surfaces

- `Xomper/Features/AIReview/AIReviewView.swift`
- `Xomper/Features/AIReview/AIReviewDetailView.swift`

## Web surfaces touched

- `pages/ai-review/ai-review-list.component.*` (new)
- `pages/ai-review/ai-review-detail.component.*` (new)
- `services/ai-review.service.ts` (extend with `list()` + `get(id)`)
- `app.routes.ts` — register `/ai-review` and `/ai-review/:id`
- s4 Recap sub-tab consumes the detail surface

---

## Dependencies

- **s5** (landing hub) — `ai-review.service` skeleton exists; this stub extends it.
- (transitively) **s1** for the sidebar entry under Play / Admin.

---

## Open questions for `/plan` to resolve

- [ ] **Drawer placement**: brainstorm notes the **reader** is for everyone but iOS lists `aiReview` under Admin in the drawer. Web sidebar — put it under Play (semantically correct) or Admin (matches iOS exactly)? Same surface, different section.
- [ ] **List filtering**: iOS shows all reports chronologically. Web — add type filter chips (weekly recap / playoff preview / etc.) now, or keep flat?
- [ ] **Detail rendering**: AI Review content is server-rendered HTML. Sanitization strategy — Angular's `DomSanitizer`, or render into a sandboxed iframe to match email-template fidelity?
- [ ] **Deep-linking from Landing headline card**: clicking the Landing headline card → opens detail view directly. Routing pattern needs to match s5's link emission shape.

---

## Out of scope

- Admin trigger surface (`POST /ai-review/trigger`) — s7 owns that.
- Pre-send broadcast preview — s7 owns the `AIReviewPreviewView` port.
- Theme/visual polish — s10.
- Backend changes. None required.

---

## Backend contract dependencies

| New service(s) | Backend contract used | New backend work? |
|---|---|---|
| extends `ai-review.service` | Lambda `GET /ai-reports`, `GET /ai-reports/{id}` | No |

---

## Success criteria

- `/ai-review` lists all AI reports for the home league chronologically.
- `/ai-review/:id` renders the detail view, including sanitized HTML body.
- Landing headline card deep-links into the correct detail route.
- s4 Recap sub-tab consumes the detail surface (or component) without duplication.
- Non-admins can read; admin entry point is added in s7.

---

## Next step

Run `/plan s6-ai-review-hub` to expand this skeleton into implementation-level detail.
