# Architecture — xomper-front-end

> Reference with @docs/architecture.md when relevant.
> Not loaded every session — only when needed.

## Overview
Angular single-page application hosted on S3 behind CloudFront. Uses Supabase for authentication and communicates with the xomper-back-end via API Gateway REST endpoints. Auto-deploys on push to master via GitHub Actions.

## Key Design Decisions
| Decision | Rationale | Date |
|----------|-----------|------|
| Angular 18 over React/Next.js | Opinionated framework with built-in DI, routing, and RxJS | — |
| Supabase for auth | Simple auth with social logins, no custom backend auth needed | — |
| S3 + CloudFront hosting | Static SPA, low cost, fast CDN delivery | — |
| RxJS for state management | Native to Angular, handles async data streams cleanly | — |
| SCSS over CSS-in-JS | Angular convention, supports variables and mixins | — |

## Data Flow
1. User authenticates via Supabase (JWT issued)
2. Angular services make HTTP requests to xomper-back-end API Gateway with JWT
3. API Gateway validates JWT via authorizer Lambda, routes to service Lambda
4. Responses flow back through Angular services into components via RxJS observables
5. Components render data using Angular templates and change detection

## External Dependencies
| Service | Purpose | Docs |
|---------|---------|------|
| Supabase | User authentication and session management | https://supabase.com/docs |
| xomper-back-end API | Fantasy football data and notifications | Internal |
| AWS CloudFront | CDN for static asset delivery | https://docs.aws.amazon.com/cloudfront/ |
| AWS S3 | Static site hosting | https://docs.aws.amazon.com/s3/ |

## Known Limitations / TODOs
- [ ] No SSR — purely client-side rendered
- [ ] No offline support or service worker
