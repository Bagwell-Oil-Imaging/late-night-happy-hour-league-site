---
feature: Weekly Data Sync
number: 19
source-paths:
  - scripts/fetch-league-data.js
  - scripts/transform-data.js
diagram: ../diagrams/flows/weekly-data-sync.md
status: no diagram
---

## Intent
Imports the week's bowling results from the LeaguePals API into 11 of the 12 Firestore collections after each Thursday league night. This is the primary data ingestion pipeline. (The `documents` collection is managed exclusively by the admin Documents panel.)

## Key Behaviors
- Run `npm run update-data` after each league night
- fetch-league-data.js calls LeaguePals API (no auth required — all endpoints are public) and writes raw JSON to leaguepals-data/; league-level endpoints are fetched in parallel, 16 team roster files are fetched sequentially
- transform-data.js reads raw data, transforms into typed records, clears each Firestore collection, then re-writes 11 Firestore collections for the season (leagueConfig, seasons, scheduleWeeks, teams, bowlers, matchups, matchupDetails, bowlerScores, announcements, events, carouselImages); the `documents` collection is NOT managed by the pipeline
- Admin-overridden documents (adminOverride: true) are preserved across pipeline runs for teams, bowlers, matchupDetails, and bowlerScores — they are read before the clear and restored after the pipeline writes

## Conditional Paths
- If fetch fails (API unreachable), transform does not run — `npm run update-data` chains the two scripts with `&&` so a non-zero exit from fetch prevents transform from starting
- If a Firestore collection write fails mid-pipeline, previous collections may be partially updated (no atomic transaction across collections)
- If Firestore is not initialized (service account missing), all Firestore writes are silently skipped — local JSON files in src/data/ are still produced
- Each collection is cleared before re-writing; this is not a simple upsert — it is a full delete-then-write per run

## External Dependencies
- LeaguePals API (HTTP, no authentication required)
- Firebase Admin SDK with service account JSON (FIREBASE_SERVICE_ACCOUNT_PATH env var; defaults to ./service-account.json)
- Local leaguepals-data/ directory for intermediate JSON

## Known Issues
None

## Notes
Pipeline is NOT transactional across collections — a failed write mid-run leaves data partially updated. Safe to re-run since each run clears and rewrites all 11 collections. Takes ~30-60 seconds for a full season. Service account JSON is gitignored.
