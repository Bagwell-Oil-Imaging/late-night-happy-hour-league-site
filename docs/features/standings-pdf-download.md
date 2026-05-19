---
feature: Standings PDF Download
number: 20
source-paths:
  - scripts/download-weekly-standings.js
diagram: ../diagrams/flows/standings-pdf-download.md
status: no diagram
---

## Intent
Automatically downloads PDF snapshots of weekly standings from LeaguePals for archival and display in the Standings PDF modal on the public site.

## Key Behaviors
- Script logs in to LeaguePals via direct API POST (not UI form), injects session cookies into Puppeteer browser
- Navigates to league Scoring tab, opens PrintStandingsModal, reads allWeeks list from the Angular scope
- Harvests any pre-existing snapshot IDs from originalWeeks (prior admin sessions) before generating new ones
- For each week missing a snapshot ID: selects the week in the modal, waits for canPrint(), clicks PRINT, and captures the snapshot ID by intercepting POST /saveCurrentStandings response or reading the resulting /currentstandings?id= URL
- Snapshot IDs are cached in weekly-standings-pdfs/snapshot-ids.json (resumable — re-running skips already-cached weeks)
- Renders each /currentstandings?id=<id> page to a PDF using Puppeteer; PDFs are cached locally and not re-rendered on subsequent runs
- Uploads PDFs to Google Drive; upload state is cached in weekly-standings-pdfs/drive-uploads.json to avoid re-uploading
- Supports --limit N flag to stop after generating N new snapshot IDs (useful for testing)
- Does NOT write Firestore document records; no Firestore writes occur in this script

## Conditional Paths
- Script exits immediately if LEAGUEPALS_EMAIL or LEAGUEPALS_PASSWORD are missing from .env
- Login fails (no cookies returned) → process.exit(1)
- Drive upload is skipped if GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, or GOOGLE_OAUTH_REFRESH_TOKEN are missing (warning logged, PDFs still saved locally)
- A week where canPrint() never becomes visible (no bowling data) is skipped and logged; it can be retried on the next run
- In CI (CI=true env var), Puppeteer runs headless with --disable-dev-shm-usage flags
- DUMP_MODAL env var causes the script to exit after the first modal inspection, useful for debugging Angular scope structure

## External Dependencies
- LEAGUEPALS_EMAIL, LEAGUEPALS_PASSWORD (required — .env)
- GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, GOOGLE_OAUTH_REFRESH_TOKEN (required for Drive upload — .env)
- DRIVE_FOLDER_2025_2026_WEEKLY_REPORTS (optional — Drive folder ID; auto-created if absent)
- DRIVE_FOLDER_2025_2026 (optional — parent season folder ID for folder creation)
- LeaguePals website (Puppeteer headless Chrome, Angular SPA)
- Google Drive v3 API (PDF upload and public permissions)

## Known Issues
BLOCKED — snapshot ID capture via POST /saveCurrentStandings interception has not been confirmed to work in practice. The script has a full implementation strategy but the interception may silently fail if the endpoint path differs or the network call does not fire as expected. See docs/known-issues.md for full details and what has been tried.

## Notes
StandingsPdfModal on the public site reads from the Firestore `documents` collection, but this script does NOT write those records — a separate admin step or manual Firestore write would be required to wire PDFs into the display flow. Do not invest further time until the snapshot ID capture approach is confirmed to work end-to-end.
