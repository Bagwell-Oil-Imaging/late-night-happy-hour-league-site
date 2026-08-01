---
feature: Weekly Data Sync
number: 19
source-paths:
  - scripts/fetch-league-data.js
  - scripts/transform-data.js
---

## Intent
Imports the week's bowling results from the LeaguePals API into 11 of the 12 Firestore collections after each Thursday league night. This is the primary data ingestion pipeline. (The `documents` collection is managed exclusively by the admin Documents panel.)

## Key Behaviors
- Run `npm run update-data` after each league night
- fetch-league-data.js calls LeaguePals API (no auth required — all endpoints are public) and writes raw JSON to leaguepals-data/; league-level endpoints are fetched in parallel, 16 team roster files are fetched sequentially
- transform-data.js reads raw data, transforms into typed records, clears each Firestore collection, then re-writes 11 Firestore collections for the season (leagueConfig, seasons, scheduleWeeks, teams, bowlers, matchups, matchupDetails, bowlerScores, announcements, events, carouselImages); the `documents` collection is NOT managed by the pipeline
- Admin-overridden documents (adminOverride: true) are preserved across pipeline runs for teams, bowlers, matchupDetails, and bowlerScores — they are read before the clear and restored after the pipeline writes
- Each `bowlerScores` document stores `avgBeforeThisWeek` from the bowler's exact cumulative pins and games before that week's scores are added; `rollingAvg` remains the floored average through that week
- Partial weeks preserve every numeric LeaguePals game and count only those games toward the running average; a score record is fully blinded only when it contains no numeric games

## Conditional Paths
- If fetch fails (API unreachable), transform does not run — `npm run update-data` chains the two scripts with `&&` so a non-zero exit from fetch prevents transform from starting
- If `npm run fetch` is run before scores are entered in LeaguePals, team roster files will have no `weekGames` entry for that week's date; `buildMatchups` sets `completed: false` and `buildWeeklyMatchupDetails` skips writing that week's records (guard: both teams scratchSeries = 0)
- If a Firestore collection write fails mid-pipeline, previous collections may be partially updated (no atomic transaction across collections)
- If Firestore is not initialized (service account missing), all Firestore writes are silently skipped — local JSON files in src/data/ are still produced
- Each collection is cleared before re-writing; this is not a simple upsert — it is a full delete-then-write per run

## External Dependencies
- LeaguePals API (HTTP, no authentication required)
- Firebase Admin SDK with service account JSON (FIREBASE_SERVICE_ACCOUNT_PATH env var; defaults to ./service-account.json)
- Local leaguepals-data/ directory for intermediate JSON

## Known Issues

**Status:** Known, not urgent
**Affected:** `scripts/fetch-league-data.js`, `scripts/transform-data.js`

The pipeline is hardcoded to a single season, not driven by Firestore config:
- `fetch-league-data.js:23` — `LEAGUE_ID` is a literal constant; it does not read `leagueConfig.leaguePalsId` even though that field exists on the type.
- `transform-data.js`'s `buildSeasons()` hardcodes `year: '2025-2026'`, `startDate`, and `endDate` as literals.
- `main()`'s `SEASON` constant (line ~2610) drives every `populate*` call; there is no way to target a different season without editing the script.

Practical effect: the pipeline can only ever import data for one hardcoded season at a time. Switching to a new season's LeaguePals league still requires editing `LEAGUE_ID` and `SEASON` in these scripts by hand — there is no admin-panel or config-driven way to do it.

**Previously also destructive, now fixed:** `populateSeasons()` used to run `clearCollection('seasons')` before writing, deleting the *entire* `seasons` collection on every `npm run update-data` run and replacing it with just the one hardcoded season — which would have silently wiped a season staged in advance via the admin Create Season control (see [League Settings](league-settings.md)). The `clearCollection('seasons')` call was removed; `populateSeasons()` now only ever upserts the current `SEASON`'s own document, leaving other seasons' `seasons` docs (historical or staged-ahead) untouched.

**Fix would require (for full multi-season pipeline support):** parameterizing `SEASON`/`LEAGUE_ID`/season dates via env var or CLI arg in both scripts.

## Notes
Pipeline is NOT transactional across collections — a failed write mid-run leaves data partially updated. Safe to re-run since each run clears and rewrites all 11 collections. Takes ~30-60 seconds for a full season. Service account JSON is gitignored.
