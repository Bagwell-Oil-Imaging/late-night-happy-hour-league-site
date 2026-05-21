# Changelog

All notable changes to the Late Night Happy Hour Bowling League site are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased]

### Added
- `SettingsAdmin` + `SeasonScheduleBuilder` — Add **Season Details** section with inline schedule builder: admin enters start date, total bowling weeks, and marks holiday/skip dates inline; skip weeks extend the season rather than consuming a week slot (week 1 → holiday → week 2, not week 3); completed weeks are locked; schedule batch-written to `scheduleWeeks` on save; read-only status table shown when not editing
- `MatchupDetailModal` — Add per-bowler **Avg** column and **Team Avg** summary row to the weekly matchup score breakdown; team average is computed as the sum of entering averages for all active and blind-counted bowlers that week
- `DataCorrectionAdmin` — Add per-bowler **Avg** column and **Team Avg** tfoot row to both the read-only summary panel and the edit-form score table; edit form places Avg between Bowler and G1 as a reference when marking blinds
- `scripts/get-google-refresh-token.js` — one-time CLI script (`npm run oauth-token`) to obtain a Google OAuth2 refresh token for the league Google account; required for Drive uploads from the serverless function; see `docs/runbooks/google-drive-oauth.md`
- `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REFRESH_TOKEN` env vars — OAuth2 credentials for Drive uploads (replaces service-account-based Drive auth in `api/upload-to-drive.js`)

### Added
- `DataCorrectionAdmin` — Add **Vacant team** support: when a team name contains "vacant" (case-insensitive), the matchup editor auto-assigns a flat score equal to `floor(opponent avg sum × 0.90)` for all three games, sets handicap to 0 for both sides, writes no individual bowler score docs (`individualScoresUnavailable: true`), and shows a VACANT badge with a live score preview on the inactive panel; editing the real team's scores auto-recalculates the Vacant score in real time; Vacant teams appear in the opponent dropdown for orphan/missing entries; if Vacant is assigned to the left (team1) position the editor auto-flips to editing the right (real) side

### Fixed
- `scripts/transform-data.js` `buildWeeklyMatchupDetails`: skip writing matchupDetail records when both teams have zero scratchSeries — prevents zero-score Firestore records when `npm run fetch` is run before LeaguePals scores are entered
- `src/pages/HomePage.tsx` `latestWeek`: derive from `matchups.filter(m => m.completed)` instead of `Math.max(...matchupDetails.map(m => m.week))` — prevents an unplayed week's zero-score matchupDetail records from being shown as the current "recap" week
- `api/upload-to-drive.js` Drive auth: switched from service account to OAuth2 refresh token — service accounts have no Drive storage quota and cannot create files in personal Google Drives
- `api/upload-to-drive.js` formidable import: destructure `{ formidable }` from the module — formidable v3 no longer exports a callable as its default export
- `vercel.json` SPA rewrite: exclude `/@*` paths so Vite virtual modules (`/@vite/client`, `/@react-refresh`) are no longer intercepted by the rewrite rule, fixing `vercel dev`

### Added
- `src/utils/drive.ts` — `driveFileUrl(fileId)` and `driveDownloadUrl(fileId)` helpers that convert a Google Drive file ID to a viewer or download URL
- `DocumentSource.driveFileId: string | null` field — replaces Firebase Storage URL with a Drive file ID for PDF documents
- Drag-and-drop PDF upload zone in `DocumentsAdmin` — uploads immediately to Google Drive on file select or drop (no waiting for form submit); shows spinner while uploading, green checkmark + Drive link on success, error message on failure

### Changed
- Contact page: replaced Formspree form with Google Forms iframe embed; removed `VITE_FORMSPREE_ID` env var dependency (ADR-007)
- **Admin panel UI overhaul** — comprehensive redesign across all admin routes:
  - `AnnouncementsAdmin.css` — added missing `.admin-field`, `.admin-label`, `.admin-input`, `.admin-select`, `.admin-textarea`, `.admin-field-check`, `.admin-check-label` shared classes; polished buttons (hover lift + gold glow), form cards (gold left-border accent, section divider), inputs (gold focus ring), table (accent-colored headers, pill badges), and checkbox rows
  - `DocumentsAdmin.css` — added all missing form class definitions, replaced raw upload input with drag-drop zone styles (idle / dragging / uploading / done states), active-row left-border indicator, improved badge and action-button styles; removed source-toggle and markdown-textarea styles (text source no longer supported)
  - `AdminLayout.css` — added vertical brand/links separator, improved nav font to Anton display, added subtle nav gradient, polished active-link pill state
  - `AdminLoginPage.css` — replaced all hard-coded hex values with design-system variables, added card entrance animation, improved button to full-width with hover lift

### Changed
- `DocumentsAdmin` simplified: bylaws PDFs only (type selector removed), season year is now a dropdown populated from the `seasons` collection, markdown/text content source removed, PDF upload is immediate (fires to Google Drive on file select/drop, before form submit)
- `LeagueDocument.type` narrowed from union `'bylaws' | 'rules' | 'prizefund' | 'handbook' | 'other'` to just `'bylaws'`

### Deprecated
- `DocumentSource.fileUrl` — superseded by `driveFileId`; will be removed after phase-3 and phase-4 consumers are updated

---

- High Individual Game and High Individual Series highlight cards on the Home Page (top 3 bowlers per category for the latest completed week)
- `useBowlerScoresByWeek` hook in `src/hooks/index.ts` — fetches non-blinded `BowlerScore` documents for a specific week; uses sentinel pattern to avoid over-fetching when the week is not yet resolved
- Composite Firestore index: `bowlerScores` on `seasonYear ASC, week ASC, blinded ASC` (required by the new hook)
- `.highlight-team-sub` CSS class for muted team name subtitle in individual highlight card entries
- Firebase Firestore integration replacing all static JSON data files
- 12 Firestore collections: leagueConfig, teams, bowlers, bowlerScores, matchups, matchupDetails, scheduleWeeks, seasons, documents, announcements, events, carouselImages
- Generic `useCollection<T>` and `useDocument<T>` React hooks with real-time `onSnapshot` listeners
- 16 domain-specific Firestore hooks for all collections
- Admin CRUD UI at `/admin` with Firebase Auth guard
- Admin panels for announcements (pinned, expiresAt), events (endDate, allDay), carousel images, and documents (PDF upload, version management)
- Firebase Storage integration for PDF document uploads
- `scripts/seed-firestore.js` — one-time seeder from legacy JSON files
- `scripts/verify-seed.js` — Firestore collection count validator
- Composite Firestore indexes for all multi-field queries
- Security rules for Firestore and Firebase Storage

### Changed
- `scripts/transform-data.js` — now writes directly to Firestore via firebase-admin batch writes
- All React components migrated from static JSON imports to live Firestore hooks
- TypeScript interfaces updated to match new Firestore schema (corrected 21 schema issues)
- `team1Score`/`team2Score` renamed to `team1ScratchScore`/`team2ScratchScore`
- `g1`/`g2`/`g3` game fields renamed to `game1`/`game2`/`game3` throughout
- Absent bowler game scores stored as `null` (not `0`) to prevent aggregate corruption
- Blind game detection now uses LeaguePals `"-"` marker instead of average comparison

### Removed
- All `src/data/*.json` static data files
- `BowlerStat`, `BowlerWeek`, `TeamDetail` TypeScript interfaces (replaced by Firestore types)
- `dataWeek` field from schedule weeks (array-index artifact with no Firestore equivalent)
