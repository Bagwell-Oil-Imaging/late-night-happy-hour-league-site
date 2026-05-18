# Late Night Happy Hour Bowling League — Claude Code Notes

## Project Structure

```
late-night-happy-hour-league-site/
├── src/
│   ├── components/           # Reusable UI components
│   │   ├── admin/            # AdminLayout + RequireAuth
│   │   ├── AnnouncementsModal.tsx
│   │   ├── AwardLeaders.tsx
│   │   ├── BowlerProfileModal.tsx
│   │   ├── BylawsModal.tsx
│   │   ├── Carousel.tsx
│   │   ├── HamburgerMenu.tsx
│   │   ├── Header.tsx
│   │   ├── LeagueStandings.tsx
│   │   ├── MatchupDetailModal.tsx
│   │   ├── NavCard.tsx
│   │   ├── StandingsPdfModal.tsx
│   │   ├── WeekMatchupsModal.tsx
│   │   └── WeekSelector.tsx
│   ├── context/
│   │   └── SeasonContext.tsx  # SeasonProvider + useSeasonYear
│   ├── hooks/
│   │   ├── useFirestore.ts   # Generic useCollection<T> + useDocument<T>
│   │   └── index.ts          # Domain hooks (useTeams, useMatchups, etc.)
│   ├── pages/
│   │   ├── admin/            # AnnouncementsAdmin, EventsAdmin, CarouselAdmin,
│   │   │                     # DocumentsAdmin, SettingsAdmin, DataCorrectionAdmin
│   │   ├── BowlersPage.tsx
│   │   ├── ContactPage.tsx
│   │   ├── HistoryPage.tsx
│   │   ├── HomePage.tsx
│   │   ├── LanesPage.tsx
│   │   ├── MatchupsPage.tsx
│   │   ├── SchedulePage.tsx
│   │   ├── StandingsPage.tsx
│   │   └── TeamsPage.tsx
│   ├── types/index.ts        # All TypeScript interfaces (Firestore schema)
│   ├── utils/
│   │   ├── admin.ts          # nowIso() timestamp helper
│   │   ├── drive.ts          # driveFileUrl, driveEmbedUrl, driveDownloadUrl
│   │   └── weeklyStandingsPdf.ts
│   ├── firebase.ts           # Firebase init (db, auth — no Storage)
│   ├── App.tsx
│   └── main.tsx
├── api/
│   └── upload-to-drive.js    # Vercel serverless — POST /api/upload-to-drive
├── scripts/
│   ├── fetch-league-data.js  # Fetches raw data from LeaguePals API
│   ├── transform-data.js     # Transforms and writes all 12 Firestore collections
│   └── download-weekly-standings.js
├── docs/
│   ├── adr/                  # Architecture Decision Records — see docs/adr/index.md
│   └── known-issues.md       # Active unresolved problems
├── .claude/                  # Claude Code config (rules, commands, agents)
├── firestore.rules
├── firestore.indexes.json
├── firebase.json
├── vercel.json
├── .env.example
├── index.html
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## Architecture

Data flows: LeaguePals API → `fetch-league-data.js` → `leaguepals-data/` → `transform-data.js` → Firestore.

React components read from Firestore via domain hooks in `src/hooks/index.ts`, wrapping the generic `useCollection<T>` and `useDocument<T>` hooks in `src/hooks/useFirestore.ts`.

**All 12 Firestore collections:**
- `teams` — Team records and standings
- `bowlers` — Bowler profiles and averages
- `bowlerScores` — Individual game scores per week
- `matchups` — Weekly team matchups (schedule)
- `weeklyMatchupDetails` — Detailed per-team, per-week score breakdowns
- `scheduleWeeks` — Week metadata and dates
- `seasons` — Season configuration
- `leagueConfig` — League-wide settings
- `announcements` — Admin-managed announcements
- `events` — Admin-managed league events
- `carouselImages` — Admin-managed homepage carousel images
- `documents` — Bylaws/documents with Drive file ID references

## Environment Setup

Copy `.env.example` to `.env` and fill in all `VITE_FIREBASE_*` values from Firebase Console → Project Settings → Your Apps.

For the transform pipeline, set `FIREBASE_SERVICE_ACCOUNT_PATH` to a local service account JSON path. File is gitignored (`service-account.json`).

For Drive upload, set `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REFRESH_TOKEN` in both `.env.local` and Vercel project settings.

## npm Scripts

- `npm run dev` — Vite dev server (http://localhost:5173). Does NOT serve `api/`
- `npm run build` — TypeScript compile + Vite production build
- `npm run fetch` — Fetch raw data from LeaguePals API
- `npm run transform` — Transform fetched data and write to Firestore
- `npm run update-data` — `fetch` + `transform` in sequence (run after each league night)
- `npm run standings` — Puppeteer script to download weekly standings PDFs
- `npm run deploy:rules` — Deploy Firestore rules and indexes

To test `api/upload-to-drive.js` locally, use `npx vercel dev` instead of `npm run dev`.

## Admin UI

Accessible at `/admin/login`. Firebase Auth (email/password). Route guard: `src/components/admin/RequireAuth.tsx`.

- `/admin/announcements` — Create, edit, delete announcements
- `/admin/events` — Create, edit, delete league events
- `/admin/carousel` — Manage homepage carousel images
- `/admin/documents` — Upload and version PDF bylaws (stored in Google Drive)
- `/admin/settings` — League configuration
- `/admin/data-correction` — Two-panel matchup score editor

## Documentation

- Architecture decisions (and rejected alternatives): `docs/adr/index.md`
- Active known issues: `docs/known-issues.md`

## Docs Map

| Change type | Update |
|-------------|--------|
| Any code change | `CHANGELOG.md` |
| New/removed file or directory | `CLAUDE.md` (structure), `README.md` |
| Architecture decision made or rejected | `docs/adr/NNN-*.md` + `docs/adr/index.md` |
| New unresolved problem | `docs/known-issues.md` |
| Problem resolved | `docs/known-issues.md` (remove entry), `CHANGELOG.md` |
| New env variable | `.env.example` |
| New operational procedure | `docs/runbooks/` |
| Admin panel added/removed | `CLAUDE.md` (Admin UI section) |
| Firestore collection added/removed | `CLAUDE.md` (Architecture), `src/types/index.ts` |

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **late-night-happy-hour-league-site** (1960 symbols, 2948 relationships, 89 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius before making changes.
- **MUST run `gitnexus_detect_changes()` before committing** to verify changes only affect expected symbols.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk.
- Use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping.
- Use `gitnexus_context({name: "symbolName"})` for full caller/callee context on a symbol.

## Never Do

- NEVER edit a symbol without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename`.
- NEVER commit without running `gitnexus_detect_changes()`.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/late-night-happy-hour-league-site/context` | Codebase overview, index freshness |
| `gitnexus://repo/late-night-happy-hour-league-site/clusters` | All functional areas |
| `gitnexus://repo/late-night-happy-hour-league-site/processes` | All execution flows |

## CLI

| Task | Skill |
|------|-------|
| How does X work? | `gitnexus-exploring` |
| What breaks if I change X? | `gitnexus-impact-analysis` |
| Why is X failing? | `gitnexus-debugging` |
| Rename / refactor safely | `gitnexus-refactoring` |

<!-- gitnexus:end -->
