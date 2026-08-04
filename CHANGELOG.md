# Changelog

All notable changes to the Late Night Happy Hour Bowling League site are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased]

### Changed
- `Footer` - Extract from inline JSX in `App.tsx` into `src/components/Footer.tsx` so it can read `useSeasonYear()`; adds a live "Season YYYY-YYYY" line (same admin-managed setting as the header) above the copyright line, which stays pinned to the site's 2025 launch year instead of drifting with the season.

### Fixed
- `Header` - Hamburger button no longer left a gap of empty space on its right on mobile (`.header-actions` now carries its own `margin-left: auto` instead of relying on `.nav`'s, which is `display: none` below 768px). Also fixes a horizontal overflow at ≤360px viewports (logo + hamburger no longer clipped off the right edge) by tightening the header's flex gap and shrinking the logo/hamburger further at the ≤480px breakpoint.

### Added
- `Header` + `QRCodeModal` - Add a **QR Code** option to the hamburger dropdown menu that opens a modal with a scannable QR code for the production site URL, plus Copy Image (Clipboard API) and Download (PNG) actions. QR generation is client-side via the new `qrcode` dependency — no network call, no external QR service. Sitewide via the header, not just the off-season landing page.
- `SettingsAdmin` - Add a **Create Season** control that stages a brand-new season by writing `seasons/{year}` and `leagueConfig/{year}` documents with defaults matching the LeaguePals pipeline's own no-API-data fallback; season year and total weeks are both selectors (year auto-generates the next sequential, non-overlapping options after the latest existing season, e.g. 2026-2027 → 2027-2028; total weeks defaults to 32) rather than free text, so a season can't be entered as overlapping or malformed. The new season immediately appears in the Active Season and Season Details dropdowns so its schedule can be built ahead of time (`create-season` operation added to `api/local-admin-write.js`).
- `OffSeasonLanding` - Show the Week 1 calendar date (`MM/DD/YYYY`) beneath the countdown, add a **"How the League Works"** section rendering the shared Team Format / League Obligations / Dues & Fees cards (extracted from `ContactPage` into `src/components/LeagueFormatInfo.tsx` so both pages share one source of truth), rename the primary CTA to **"Join the League!"**, and temporarily hide the season-history CTA.
- `LeagueFormatInfo` - Update league-rules content: USBC sanctioning, 7:50 PM practice / 8:00 PM league play, Week 1 kickoff meeting at 7:30 PM, two 16-week playoff halves (top 8 teams each, half winners bowl for the league championship), entering-average definition (prior season's average or Week 1 average, rolling after 9 games), $25/week dues, and per-point-plus-achievement payouts. Also corrects blind scoring from 2/3 of entering average to 90% of rolling average.
- `SettingsAdmin` + `SeasonContext` - Add a **Season Status** toggle (In Season / Between Seasons) with an upcoming-season year field, stored as `seasonActive` / `upcomingSeasonYear` on `settings/global`. When between seasons, `HomePage` swaps its dashboard for a new `OffSeasonLanding` view promoting the league interest form (links to `/contact`) and season history (`/history`), plus a new `SeasonCountdown` component that counts down to the upcoming season's Week 1 date once its schedule exists in `scheduleWeeks`.
- `HomePage` - Add Previous/Next controls to browse completed visible recap weeks directly from the homepage, updating the recap scoreboard, highlights, playoff bracket, standings PDF, and matchup link together.
- `DataCorrectionAdmin` - Add a per-team matchup handicap pin: admins can override the automatically calculated per-game handicap, persist it with the matchup, and return to Auto calculation at any time.
- `DataCorrectionAdmin` - Make each bowler's weekly **Avg** editable in the individual score editor; persist the override as `avgBeforeThisWeek` and use it for that matchup's blind scores, team average, and handicap.
- `BowlersPage` - Add each bowler's cumulative rolling average through the selected week as an **Avg** column in the weekly score-history table.
- `DataCorrectionAdmin` - Add **+ Add Sub** to the Edit Scores individual score editor: pick an existing league-wide substitute or create a new one with a separately stored entering average, then manually enter the sub's average for the selected week. The weekly value drives that matchup's handicap contribution. Substitute bowlers are stored as `bowlers` docs with `isSubPool: true` and are filtered out of all public-facing bowler queries (`useBowlers`) so they never appear on leaderboards or team rosters.
- `DataCorrectionAdmin` - Show each bowler's season games played in parentheses beside their name in the individual score editor.
- `HomePage` + `WeekMatchupsModal` - Add the `PlayoffBracket` to the homepage recap tab (latest week) and the weekly matchups modal (selected week), reusing the same self-hiding component already shown on `MatchupsPage`.
- `PlayoffBracket` - Make bracket team rows clickable, opening the existing `MatchupDetailModal` for that team's real matchup that week (their actual lane opponent, not the bracket-seeded one — see the Fixed entry below on how playoff advancement is scored).
- `PlayoffBracket` + `MatchupsPage` - Add a live, three-week single-elimination bracket above weekly matchups, including projected/locked half seeds and completed-round results.
- `PlayoffSettings` + `SettingsAdmin` - Add a per-season playoff field setting for 2–8 qualifying teams, with first-round byes for smaller fields.
- `SettingsAdmin` + `scheduleWeeks.visible` - Add per-week public visibility toggles with quick actions to show all weeks or hide weeks 1-16; public schedule, matchup navigation, homepage week selection, and half-awards now omit hidden weeks while admin tools keep access.
- `SettingsAdmin` - Add a **Season Settings** placeholder card for upcoming week visibility controls, including the target use case of hiding corrupted weeks 1-16 from public views.
- Local admin bypass - Add VITE_LOCAL_ADMIN_BYPASS / LOCAL_ADMIN_BYPASS localhost-only dev flags so admin routes and re-ingest API calls can be exercised while Firebase email-link quota is exhausted.
- `scripts/dev-api-server.js` + `npm run dev:api` - Add a local API server on `http://localhost:3000` so Vite can proxy admin serverless routes without requiring a valid Vercel CLI token; local startup falls back to `FIREBASE_SERVICE_ACCOUNT_PATH` when `GOOGLE_SERVICE_ACCOUNT_JSON` is placeholder or mismatched.
- `DataCorrectionAdmin` + `/api/reingest-week` - Add **Re-ingest data** to the Edit Scores week view; it dry-runs a selected-week LeaguePals refresh, shows immediate UI status while fetching/replacing, warns with a summary of manual `adminOverride` score/detail values that will be replaced, then overwrites only that week's `matchups`, `matchupDetails`, and `bowlerScores` after confirmation.
- `SettingsAdmin` + `SeasonScheduleBuilder` — Add **Season Details** section with inline schedule builder: admin enters start date, total bowling weeks, and marks holiday/skip dates inline; skip weeks extend the season rather than consuming a week slot (week 1 → holiday → week 2, not week 3); completed weeks are locked; schedule batch-written to `scheduleWeeks` on save; read-only status table shown when not editing
- `MatchupDetailModal` — Add per-bowler **Avg** column and **Team Avg** summary row to the weekly matchup score breakdown; team average is computed as the sum of entering averages for all active and blind-counted bowlers that week
- `DataCorrectionAdmin` — Add per-bowler **Avg** column and **Team Avg** tfoot row to both the read-only summary panel and the edit-form score table; edit form places Avg between Bowler and G1 as a reference when marking blinds
- `scripts/get-google-refresh-token.js` — one-time CLI script (`npm run oauth-token`) to obtain a Google OAuth2 refresh token for the league Google account; required for Drive uploads from the serverless function; see `docs/runbooks/google-drive-oauth.md`
- `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REFRESH_TOKEN` env vars — OAuth2 credentials for Drive uploads (replaces service-account-based Drive auth in `api/upload-to-drive.js`)

### Changed
- `HistoryPage` - Exclude seasons with an empty `teams` array from the League History list, so a season staged in advance via Create Season never shows up as an unplayed "Invalid Date" card in the public archive.
- `HomePage` - Restyle recap Previous/Next controls as compact, borderless muted arrows with a restrained hover accent.
- Handicap calculation - Floor both team-average totals before calculating their difference and applying the Team Difference percentage; continue flooring the final handicap result.
- `DataCorrectionAdmin` - Place the Add Sub entering and weekly average fields on their own full-width row and widen them so both placeholders remain readable.
- `MatchupsPage` - Move the Standings PDF button into the same row as the week selector (right-aligned via a 3-column toolbar grid) instead of its own row below.

### Added
- Local admin bypass - Add VITE_LOCAL_ADMIN_BYPASS / LOCAL_ADMIN_BYPASS localhost-only dev flags so admin routes and re-ingest API calls can be exercised while Firebase email-link quota is exhausted.
- `DataCorrectionAdmin` + `/api/reingest-week` - Add **Re-ingest data** to the Edit Scores week view; it dry-runs a selected-week LeaguePals refresh, shows immediate UI status while fetching/replacing, warns with a summary of manual `adminOverride` score/detail values that will be replaced, then overwrites only that week's `matchups`, `matchupDetails`, and `bowlerScores` after confirmation.
- `DataCorrectionAdmin` — Add **Vacant team** support: when a team name contains "vacant" (case-insensitive), the matchup editor auto-assigns a flat score equal to `floor(opponent avg sum × 0.90)` for all three games, sets handicap to 0 for both sides, writes no individual bowler score docs (`individualScoresUnavailable: true`), and shows a VACANT badge with a live score preview on the inactive panel; editing the real team's scores auto-recalculates the Vacant score in real time; Vacant teams appear in the opponent dropdown for orphan/missing entries; if Vacant is assigned to the left (team1) position the editor auto-flips to editing the right (real) side

### Fixed
- `scripts/transform-data.js` - Stop clearing the entire `seasons` collection before every `npm run update-data` run; `populateSeasons()` was deleting every season's document (historical and any staged ahead via the admin Create Season control) and replacing it with just the one hardcoded current season. It now only upserts the current season's own document.
- `DataCorrectionAdmin` - Compute blind scores and the displayed per-bowler Avg from each bowler's current rolling average instead of their static prior-season entering average, which had been inflating blind scores and the Avg column for returning bowlers.
- `DataCorrectionAdmin` - Source each bowler's current average from their most recent `bowlerScores.rollingAvg` (the week before the one being edited) instead of the `bowlers.average` field, which only refreshes on a full pipeline run (`npm run transform`) and goes stale after a single-week `reingest-week` correction.
- `DataCorrectionAdmin` - Compute Team Avg and handicap from each bowler's current rolling average instead of their entering average in the live editor and on save, so the saved/displayed Team Avg matches the sum of the shown per-bowler averages for whichever bowlers are actually active/blinded that week.
- `DataCorrectionAdmin` - Removing a bowler from a weekly lineup now automatically clears all three blind-score checkboxes for that bowler.
- `HomePage` - Hide the next-week Preview tab and panel when the latest completed week reaches the admin-configured `leagueConfig.totalWeeks`, preventing a nonexistent week from being advertised after the season ends.
- LeaguePals average ingestion - Persist each bowler's exact floored average entering the week before adding that week's scores, and preserve numeric games from partial weeks instead of treating the entire week as blind. Matchup averages now use the stored point-in-time value, eliminating one-pin errors caused by reversing a previously floored rolling average.
- `DataCorrectionAdmin` - Route new substitute-pool bowler creation through the local Firebase Admin bridge when localhost auth bypass is enabled, preventing the generic "Failed to add substitute" error caused by unauthenticated client Firestore writes.
- Local development - Move the bowling site's `/api/*` proxy target and local admin API bridge from port 3000 to port 3003 so another app already using port 3000 cannot intercept roster writes with a 404.
- `DataCorrectionAdmin` - Make roster add, edit, and remove work under the localhost admin bypass by routing those writes through the local Firebase Admin bridge; roster removals now retain a hidden admin-override tombstone so historical score references remain valid and future LeaguePals transforms do not recreate the removed bowler.
- MatchupDetailModal - Restore handicap values and numeric totals for historical matchup documents that still use the legacy per-game handicap field while supporting the new game-specific fields.
- Fixed individual score saves in the local admin-bypass workflow by routing `bowlerScores` and `matchupDetails` writes through the local Firebase Admin bridge.
- `MatchupsPage` - Fix the week header freezing on the previous week's label after paging back into a week with no visible matchup data — the `<select>`-based selector silently fell back to a different option whenever the current week wasn't in its choices; the jump list now always includes an entry for the current week.
- `MatchupsPage` - Extend the back-navigation floor to a hidden half's own first playoff week (rather than blocking at week 1 or wherever public data resumes), so its bracket stays reachable; going further back is now disabled. When paged into that hidden-but-bracket-reachable zone, show only the bracket and a short explanatory note instead of the scoreboard table, PDF button, and "No matchup data" message.
- `PlayoffBracket` - Decide playoff round winners by comparing each seeded team's own three-game total pins that week instead of looking for a scheduled head-to-head matchup; playoff weeks keep the normal round-robin lane rotation, so no such matchup ever exists past Round 1, leaving every later round stuck on TBD. Also add a champion banner once the half's final is decided.
- `PlayoffBracket` - Replace the vertical alignment/connector-line CSS heuristics (which misaligned semifinal/final cards and drew no bracket lines) with measured positioning: `useLayoutEffect` centers each semifinal/final card on its two feeder matches and draws SVG elbow connectors between rounds.
- `PlayoffBracket` - Fix a self-inflicted `ResizeObserver` feedback loop where the connector SVG's size was read from its own container's `scrollHeight`, inflating the section's height every measurement pass; the SVG is now sized purely via CSS.
- `PlayoffBracket` - Correct first-half seed cutoff to week 13 (was 12), so week 13's regular-season results count toward seeding instead of being dropped in an unused gap before Week 14 playoffs.
- `scripts/transform-data.js` - Remove a dead `if (false)` guard that skipped `populateLeagueConfig`, which combined with the preceding `clearCollection('leagueConfig')` call meant every data refresh wiped the season's league configuration and never rewrote it.
- `api/local-admin-write.js` - Remove a duplicated `set-playoff-team-count` branch that had swallowed the `set-week-visibility` operation's body, silently no-opping admin week-hide requests made through the local bypass.
- Local admin bypass + `AdminLoginPage` — Route local SettingsAdmin season, visibility, and schedule writes through a localhost-only service-account endpoint; reject non-allowlisted email addresses before requesting a Firebase email sign-in link.
- `make run` - Start Vite and the local API bridge together through `npm run dev:local`, stopping both processes together on exit so the local admin service-account bypass is available.
- `useScheduleWeeks` - Resubscribe when the selected season changes, so Season Details detects and displays the existing 2025-2026 calendar after the active-season setting loads.
- `SeasonScheduleBuilder` - Allow completed seasons to be corrected after the fact: saving a lower total (such as 33 to 32) updates `leagueConfig.totalWeeks` and removes only surplus schedule calendar entries, retaining matchup and score data.
- `SettingsAdmin` - Combine the redundant Season Settings and Season Details cards into one Season Details view with a single schedule table that includes each week's Public visibility control.
- SettingsAdmin + firestore.rules - Make week visibility write failures actionable by detecting missing Firebase auth before writing and explicitly allowing authenticated scheduleWeeks writes in Firestore rules.
- `vite.config.ts` - Proxy local `/api/*` requests from Vite on `http://localhost:3001` to the local API dev server on `http://localhost:3000`, so admin re-ingest calls no longer 404 during local development.
- `scripts/transform-data.js` + `MatchupDetailModal` - Populate Vacant team matchup detail scores during ingestion as 90% of the active opponent's team average for each game, calculate points against those scores, and display stored Vacant totals in matchup details
- `scripts/transform-data.js` - Cap blind-counted bowlers to the open four-person team slots when LeaguePals emits extra absent/blind markers; excess blind docs are removed by league priority (most prior games, then highest average) so five-person rosters only contribute four scores per week
- `scripts/transform-data.js` - Remap blank/stale matchup detail admin overrides back onto canonical pipeline matchup documents by logical team identity so corrected vacant-team rows do not restore as duplicates
- `scripts/transform-data.js` + `MatchupsPage` - Preserve scheduled empty-roster Vacant teams in matchup details with `isVacantTeam` / `vacantTeamNumber` metadata so all-matchups can display vacant-team pairings while vacancy scoring rules remain pending
- `scripts/transform-data.js` `buildWeeklyMatchupDetails`: skip writing matchupDetail records when both teams have zero scratchSeries — prevents zero-score Firestore records when `npm run fetch` is run before LeaguePals scores are entered
- `src/pages/HomePage.tsx` `latestWeek`: derive from `matchups.filter(m => m.completed)` instead of `Math.max(...matchupDetails.map(m => m.week))` — prevents an unplayed week's zero-score matchupDetail records from being shown as the current "recap" week
- `api/upload-to-drive.js` Drive auth: switched from service account to OAuth2 refresh token — service accounts have no Drive storage quota and cannot create files in personal Google Drives
- `api/upload-to-drive.js` formidable import: destructure `{ formidable }` from the module — formidable v3 no longer exports a callable as its default export
- `vercel.json` SPA rewrite: exclude `/@*` paths so Vite virtual modules (`/@vite/client`, `/@react-refresh`) are no longer intercepted by the rewrite rule, fixing `vercel dev`

### Added
- Local admin bypass - Add VITE_LOCAL_ADMIN_BYPASS / LOCAL_ADMIN_BYPASS localhost-only dev flags so admin routes and re-ingest API calls can be exercised while Firebase email-link quota is exhausted.
- `DataCorrectionAdmin` + `/api/reingest-week` - Add **Re-ingest data** to the Edit Scores week view; it dry-runs a selected-week LeaguePals refresh, shows immediate UI status while fetching/replacing, warns with a summary of manual `adminOverride` score/detail values that will be replaced, then overwrites only that week's `matchups`, `matchupDetails`, and `bowlerScores` after confirmation.
- `src/utils/drive.ts` — `driveFileUrl(fileId)` and `driveDownloadUrl(fileId)` helpers that convert a Google Drive file ID to a viewer or download URL
- `DocumentSource.driveFileId: string | null` field — replaces Firebase Storage URL with a Drive file ID for PDF documents
- Drag-and-drop PDF upload zone in `DocumentsAdmin` — uploads immediately to Google Drive on file select or drop (no waiting for form submit); shows spinner while uploading, green checkmark + Drive link on success, error message on failure

### Changed
- AdminLoginPage - Show and log Firebase Auth error codes when sending passwordless admin sign-in links fails, making local login setup errors diagnosable.
- Contact page: replaced Formspree form with Google Forms iframe embed; removed `VITE_FORMSPREE_ID` env var dependency (ADR-007)
- **Admin panel UI overhaul** — comprehensive redesign across all admin routes:
  - `AnnouncementsAdmin.css` — added missing `.admin-field`, `.admin-label`, `.admin-input`, `.admin-select`, `.admin-textarea`, `.admin-field-check`, `.admin-check-label` shared classes; polished buttons (hover lift + gold glow), form cards (gold left-border accent, section divider), inputs (gold focus ring), table (accent-colored headers, pill badges), and checkbox rows
  - `DocumentsAdmin.css` — added all missing form class definitions, replaced raw upload input with drag-drop zone styles (idle / dragging / uploading / done states), active-row left-border indicator, improved badge and action-button styles; removed source-toggle and markdown-textarea styles (text source no longer supported)
  - `AdminLayout.css` — added vertical brand/links separator, improved nav font to Anton display, added subtle nav gradient, polished active-link pill state
  - `AdminLoginPage.css` — replaced all hard-coded hex values with design-system variables, added card entrance animation, improved button to full-width with hover lift

### Changed
- AdminLoginPage - Show and log Firebase Auth error codes when sending passwordless admin sign-in links fails, making local login setup errors diagnosable.
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
- AdminLoginPage - Show and log Firebase Auth error codes when sending passwordless admin sign-in links fails, making local login setup errors diagnosable.
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
