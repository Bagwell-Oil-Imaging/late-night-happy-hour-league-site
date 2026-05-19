# Feature Registry

Authoritative list of user-facing features and data flows in this repo. Each row maps a feature to its primary source files. This is the index used by automated staleness detection — when Claude Code edits a source file, it cross-references this table to tell you which feature is affected.

**Feature name** links to the spec file (`docs/features/{name}.md`) — intent, key behaviors, conditional paths, dependencies.
**Diagram** links to the generated Mermaid diagram (`docs/diagrams/features/{name}.md` or `docs/diagrams/flows/{name}.md`).

**Adding a feature:** Add a row and a spec file in `docs/features/`, set Status to `no diagram`.
**Changing a feature:** Update `Key Source Paths` if files moved; update spec file if behavior changed.
**Removing a feature:** Delete the row and the spec file.
**After generating a diagram:** Update the `Diagram` link and set Status to `current`.

Run `/generate-diagrams <feature-name>` to generate or regenerate a diagram from its spec file.

---

## Public Site

| # | Feature | Description | Key Source Paths | Diagram | Status |
|---|---------|-------------|-----------------|---------|--------|
| 1 | [Home Dashboard](features/home-dashboard.md) | Hero carousel, live announcement badge in header, current-week stats, high game/series leaders | `src/pages/HomePage.tsx`, `src/components/Carousel.tsx`, `src/components/AwardLeaders.tsx` | — | no diagram |
| 2 | [League Standings](features/league-standings.md) | Tabular standings by week, week selector, PDF download modal | `src/pages/StandingsPage.tsx`, `src/components/LeagueStandings.tsx`, `src/components/WeekSelector.tsx`, `src/components/StandingsPdfModal.tsx` | [diagram](diagrams/features/league-standings.md) | current |
| 3 | [Weekly Matchups](features/weekly-matchups.md) | Team matchup grid with week selector, detailed per-game score modal | `src/pages/MatchupsPage.tsx`, `src/components/WeekMatchupsModal.tsx`, `src/components/MatchupDetailModal.tsx` | — | no diagram |
| 4 | [Team Roster](features/team-roster.md) | Team list with bowler roster per team | `src/pages/TeamsPage.tsx` | — | no diagram |
| 5 | [Bowler Profiles](features/bowler-profiles.md) | Bowler directory, per-bowler profile modal with averages and game history | `src/pages/BowlersPage.tsx`, `src/components/BowlerProfileModal.tsx` | — | no diagram |
| 6 | [Season History](features/season-history.md) | Historical standings and results browsable by season | `src/pages/HistoryPage.tsx` | — | no diagram |
| 7 | [Season Schedule](features/season-schedule.md) | Week-by-week schedule grid for the current season | `src/pages/SchedulePage.tsx` | — | no diagram |
| 8 | [Lane Assignments](features/lane-assignments.md) | Lane pair assignments display for the current week | `src/pages/LanesPage.tsx` | — | no diagram |
| 9 | [Announcements](features/announcements.md) | Live announcement modal with header badge count; pinned + priority sort | `src/components/AnnouncementsModal.tsx`, `src/components/Header.tsx` | — | no diagram |
| 10 | [League Documents](features/league-documents.md) | Bylaws PDF viewer via Google Drive embed | `src/components/BylawsModal.tsx` | — | no diagram |
| 11 | [Contact](features/contact.md) | Static contact information page | `src/pages/ContactPage.tsx` | — | no diagram |

## Admin Panel

| # | Feature | Description | Key Source Paths | Diagram | Status |
|---|---------|-------------|-----------------|---------|--------|
| 12 | [Admin Authentication](features/admin-authentication.md) | Email/password login, Firebase Auth route guard | `src/pages/admin/AdminLoginPage.tsx`, `src/components/admin/RequireAuth.tsx`, `src/components/admin/AdminLayout.tsx` | — | no diagram |
| 13 | [Announcements Management](features/announcements-management.md) | CRUD editor for league announcements with priority and pinning | `src/pages/admin/AnnouncementsAdmin.tsx` | — | no diagram |
| 14 | [Events Management](features/events-management.md) | CRUD editor for league events | `src/pages/admin/EventsAdmin.tsx` | — | no diagram |
| 15 | [Carousel Management](features/carousel-management.md) | Upload, reorder, and delete homepage carousel images | `src/pages/admin/CarouselAdmin.tsx` | — | no diagram |
| 16 | [Documents Management](features/documents-management.md) | Upload PDFs to Google Drive via serverless proxy, manage active version | `src/pages/admin/DocumentsAdmin.tsx`, `api/upload-to-drive.js` | — | no diagram |
| 17 | [League Settings](features/league-settings.md) | Admin-editable league configuration (name, season, display options) | `src/pages/admin/SettingsAdmin.tsx` | — | no diagram |
| 18 | [Data Correction](features/data-correction.md) | Two-panel matchup score editor for post-entry corrections | `src/pages/admin/DataCorrectionAdmin.tsx` | — | no diagram |

## Data Pipeline

| # | Feature | Description | Key Source Paths | Diagram | Status |
|---|---------|-------------|-----------------|---------|--------|
| 19 | [Weekly Data Sync](features/weekly-data-sync.md) | Fetch raw data from LeaguePals API, transform, write all 12 Firestore collections | `scripts/fetch-league-data.js`, `scripts/transform-data.js` | — | no diagram |
| 20 | [Standings PDF Download](features/standings-pdf-download.md) | Puppeteer-based PDF scraper for weekly standings (currently blocked — see `docs/known-issues.md`) | `scripts/download-weekly-standings.js` | — | blocked |

## Shared Infrastructure

| # | Feature | Description | Key Source Paths | Diagram | Status |
|---|---------|-------------|-----------------|---------|--------|
| 21 | [Firestore Data Layer](features/firestore-data-layer.md) | Generic `useCollection`/`useDocument` hooks with real-time subscriptions | `src/hooks/useFirestore.ts`, `src/hooks/index.ts`, `src/firebase.ts` | — | no diagram |
| 22 | [Season Context](features/season-context.md) | Multi-season data isolation, season year selection propagated via React context | `src/context/SeasonContext.tsx` | — | no diagram |
