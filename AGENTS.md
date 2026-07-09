# Late Night Happy Hour Bowling League - Codex Notes

## Project Structure

```text
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
│   ├── firebase.ts           # Firebase init (db, auth - no Storage)
│   ├── App.tsx
│   └── main.tsx
├── api/
│   └── upload-to-drive.js    # Vercel serverless - POST /api/upload-to-drive
├── scripts/
│   ├── fetch-league-data.js  # Fetches raw data from LeaguePals API
│   ├── transform-data.js     # Transforms and writes all 12 Firestore collections
│   └── download-weekly-standings.js
├── docs/
│   ├── adr/                  # Architecture Decision Records - see docs/adr/index.md
│   ├── features.md           # Feature registry index - links to specs and diagrams
│   ├── features/             # One spec file per feature
│   ├── diagrams/             # Generated Mermaid diagrams
│   └── known-issues.md       # Active unresolved problems
├── AGENTS.md                 # Codex instructions; GitNexus block is managed
├── CLAUDE.md                 # Claude Code notes; keep content in sync when relevant
├── .claude/                  # Claude Code config, commands, hooks, GitNexus skills
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

## Codex Workflow

- Prefer `rg` / `rg --files` for local search.
- Use `apply_patch` for manual file edits when the sandbox permits it.
- Do not overwrite user changes. Check `git status --short` before broad edits or commits.
- Before modifying functions, classes, or methods, follow the GitNexus impact-analysis requirements below.
- Keep `AGENTS.md` and `CLAUDE.md` aligned when changing persistent project guidance, structure, admin routes, Firestore collections, or docs workflow.
- Update `CHANGELOG.md` for any code change.

## Architecture

Data flows: LeaguePals API -> `fetch-league-data.js` -> `leaguepals-data/` -> `transform-data.js` -> Firestore.

React components read from Firestore via domain hooks in `src/hooks/index.ts`, wrapping the generic `useCollection<T>` and `useDocument<T>` hooks in `src/hooks/useFirestore.ts`.

All 13 Firestore collections:

- `teams` - Team records and standings
- `bowlers` - Bowler profiles and averages
- `bowlerScores` - Individual game scores per week
- `matchups` - Weekly team matchups (schedule)
- `matchupDetails` - Detailed per-team, per-week score breakdowns
- `scheduleWeeks` - Week metadata and dates
- `seasons` - Historical season records
- `leagueConfig` - Per-season league configuration (document ID = seasonYear)
- `announcements` - Admin-managed announcements
- `events` - Admin-managed league events
- `carouselImages` - Admin-managed homepage carousel images
- `documents` - Bylaws/documents with Drive file ID references (admin-only; not written by pipeline)
- `settings` - App-level settings; single `global` document storing `currentSeasonYear`

## Environment Setup

Copy `.env.example` to `.env` and fill in all `VITE_FIREBASE_*` values from Firebase Console -> Project Settings -> Your Apps.

For the transform pipeline, set `FIREBASE_SERVICE_ACCOUNT_PATH` to a local service account JSON path. The local service account file is gitignored as `service-account.json`.

For Drive upload, set `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, and `GOOGLE_OAUTH_REFRESH_TOKEN` in both `.env.local` and Vercel project settings.

## npm Scripts

- `npm run dev` - Vite dev server at `http://localhost:5173`. Does not serve `api/`.
- `npm run build` - TypeScript compile + Vite production build.
- `npm run fetch` - Fetch raw data from LeaguePals API.
- `npm run transform` - Transform fetched data and write to Firestore.
- `npm run update-data` - Run `fetch` + `transform` in sequence after each league night.
- `npm run standings` - Puppeteer script to download weekly standings PDFs.
- `npm run deploy:rules` - Deploy Firestore rules and indexes.

To test `api/upload-to-drive.js` locally, use `npx vercel dev` instead of `npm run dev`.

## Admin UI

Accessible at `/admin/login`. Firebase Auth uses passwordless email-link sign-in via `sendSignInLinkToEmail` / `signInWithEmailLink`; access is allowlist gated on `VITE_ADMIN_EMAILS`. Route guard: `src/components/admin/RequireAuth.tsx`.

- `/admin/announcements` - Create, edit, delete announcements
- `/admin/events` - Create, edit, delete league events
- `/admin/carousel` - Manage homepage carousel images
- `/admin/documents` - Upload and version PDF bylaws stored in Google Drive
- `/admin/settings` - League configuration
- `/admin/data-correction` - Two-panel matchup score editor

## Documentation

- Architecture decisions and rejected alternatives: `docs/adr/index.md`
- Feature registry: `docs/features.md`
- Active known issues: `docs/known-issues.md`

## Diagram Configuration

Tier and automation flags for `/generate-diagrams` and the staleness hook:

- [x] Tier: 2 repo default, with per-feature overrides allowed in the `docs/features.md` Tier column
- [x] Auto-stale on source edit via `flag-feature-stale.sh` PostToolUse hook
- [ ] Auto-regenerate on stale; manual `/generate-diagrams` preferred
- [x] GitNexus-assisted generation; index must be fresh, run `npx gitnexus analyze` if stale

Tier definitions enforced by `/generate-diagrams`:

- Tier 1 - `Flow` only
- Tier 2 - `Flow` + `Component`
- Tier 3 - `Flow` + `Component` + `Sequence` + `Class`

## Docs Map

| Change type | Update |
|-------------|--------|
| Any code change | `CHANGELOG.md` |
| New/removed file or directory | `AGENTS.md` (structure), `CLAUDE.md` (structure), `README.md` |
| Architecture decision made or rejected | `docs/adr/NNN-*.md` + `docs/adr/index.md` |
| New unresolved problem | `docs/known-issues.md` |
| Problem resolved | `docs/known-issues.md` (remove entry), `CHANGELOG.md` |
| New env variable | `.env.example` |
| New operational procedure | `docs/runbooks/` |
| Feature added, changed, or removed | `docs/features.md` (add/edit/delete row) |
| Diagram generated or regenerated | `docs/features.md` (link + status per diagram type column: Flow, Seq, Component, Class) |
| Admin panel added/removed | `AGENTS.md` and `CLAUDE.md` Admin UI sections |
| Firestore collection added/removed | `AGENTS.md` and `CLAUDE.md` Architecture sections, `src/types/index.ts` |
| `npx gitnexus analyze` run | `AGENTS.md` and `CLAUDE.md` GitNexus sections auto-updated by tool - no manual edit to the managed block |

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **late-night-happy-hour-league-site** (1822 symbols, 2634 relationships, 58 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/late-night-happy-hour-league-site/context` | Codebase overview, check index freshness |
| `gitnexus://repo/late-night-happy-hour-league-site/clusters` | All functional areas |
| `gitnexus://repo/late-night-happy-hour-league-site/processes` | All execution flows |
| `gitnexus://repo/late-night-happy-hour-league-site/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->

> GitNexus skills are installed at machine level for Claude (`~/.claude/skills/gitnexus/`). In Codex, prefer available GitNexus MCP tools when present; otherwise use the listed CLI workflows and keep the managed GitNexus block intact.
