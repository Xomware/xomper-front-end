# Xomper

Fantasy football companion app built on the [Sleeper API](https://docs.sleeper.com). Provides league management, matchup history, team analysis, taxi squad management, and rule proposals for dynasty leagues.

**Live:** https://xomper.xomware.com

## Xomware Ecosystem

| App | URL | Frontend | Backend | Infrastructure |
|-----|-----|----------|---------|----------------|
| **Xomware** (Hub) | [xomware.com](https://xomware.com) | [xomware-frontend](https://github.com/Xomware/xomware-frontend) | - | [xomware-infrastructure](https://github.com/Xomware/xomware-infrastructure) |
| **Xomify** | [xomify.xomware.com](https://xomify.xomware.com) | [xomify-frontend](https://github.com/Xomware/xomify-frontend) | [xomify-backend](https://github.com/Xomware/xomify-backend) | [xomify-infrastructure](https://github.com/Xomware/xomify-infrastructure) |
| **Xomcloud** | [xomcloud.xomware.com](https://xomcloud.xomware.com) | [xomcloud-frontend](https://github.com/Xomware/xomcloud-frontend) | [xomcloud-backend](https://github.com/Xomware/xomcloud-backend) | [xomcloud-infrastructure](https://github.com/Xomware/xomcloud-infrastructure) |
| **Xomper** | [xomper.xomware.com](https://xomper.xomware.com) | [xomper-front-end](https://github.com/Xomware/xomper-front-end) | [xomper-back-end](https://github.com/Xomware/xomper-back-end) | [xomper-infrastructure](https://github.com/Xomware/xomper-infrastructure) |

## Tech Stack

- **Frontend:** Angular 18, RxJS, SCSS, Swiper
- **Auth & DB:** Supabase (Google OAuth, email/password, PostgreSQL + RLS)
- **Backend:** AWS Lambda (Python), API Gateway, SES
- **Hosting:** S3 + CloudFront
- **CI/CD:** GitHub Actions (auto-deploy on push to `master`)
- **IaC:** Terraform Cloud

## Features

- **League Dashboard** — Standings, roster breakdowns, World Cup divisions, playoff bracket, and rule proposals with voting
- **Matchup History** — Season-by-season matchup results with expandable per-week views and animated matchup modals
- **Team View** — Full roster with starters, bench, taxi squad, and IR breakdown; per-player stat modals
- **Taxi Squad** — Browse all taxi squad players across the league; request steals with email notifications
- **Draft History** — Full historical draft board for all league drafts
- **Player Search** — Look up any Sleeper user or league by username or ID
- **Rule Proposals** — Submit, vote on, and auto-resolve league rule changes
- **Email Notifications** — SES-powered emails for rule proposals, votes, and taxi squad steal requests
- **Auth** — Supabase-backed login (Google OAuth + email/password) with route guards

## Getting Started

### Prerequisites

- Node.js 18+
- npm

### Install & Run

```bash
npm install
npm start
```

App runs at `http://localhost:4200`.

### Build

```bash
npm run build                                # development build
npm run build -- --configuration production  # production build
```

### Environment

Local config lives in `src/environments/environment.ts`. Production secrets (API keys, Supabase URL, AWS API ID) are injected at build time via AWS SSM Parameter Store through the GitHub Actions workflow.

## Deployment

Pushes to `master` trigger the GitHub Actions CI/CD pipeline which:

1. Pulls secrets from AWS SSM Parameter Store
2. Injects them into `environment.prod.ts` via `sed`
3. Builds the Angular app in production mode
4. Syncs build output to the S3 bucket behind CloudFront

Manual deploys can be triggered via `workflow_dispatch`.

## Project Structure

```
src/app/
  components/     # Shared UI (toolbar, footer, loader, toast, modals)
  pages/          # Route-level pages
    home/             # Login / landing
    league/           # League dashboard (standings, matchups, playoffs, world cup, rules)
    team/             # Team roster view with player modals
    taxi-squad/       # Taxi squad browser
    matchup-history/  # Season matchup history
    draft-history/    # Historical draft board
    profile/          # User profile
    search/           # Search Sleeper users / leagues
  services/       # Angular services (Sleeper API, Supabase, email, etc.)
  models/         # TypeScript interfaces and model classes
  animations/     # Reusable Angular animations
  constants/      # Static data (team colors)
  guards/         # Route guards (auth)
```
