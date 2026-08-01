# Known Issues

Active unresolved problems — runtime bugs, blockers, and broken features only. Remove an entry when fixed and add a CHANGELOG.md entry instead.

Code smells and maintenance risks (not broken at runtime) belong in the relevant feature spec's `## Known Issues` section only — not here.

---

## PDF Snapshot IDs — Weekly Standings Downloader

**Status:** Blocked  
**Affected:** `scripts/download-weekly-standings.js`, GitHub Actions workflow

**Problem:** The Puppeteer script downloads 33 PDFs but they all render the same empty/default page (all ~185 KB) because the snapshot IDs used to construct the standings URLs are wrong.

Each weekly standings PDF at LeaguePals requires a unique MongoDB ObjectId snapshot ID in the URL:
```
https://www.leaguepals.com/currentstandings?id=<snapshotId>
```

The script cannot currently determine the correct snapshot ID for each week. The IDs are not exposed in the LeaguePals UI or any known API endpoint.

**What was tried:**
- Scraping the page for snapshot IDs — not present in DOM
- Using week number as a lookup key — IDs are MongoDB ObjectIds, not sequential
- Intercepting network requests during Puppeteer session — IDs appear to be server-side only

**Blocker:** No known way to retrieve snapshot IDs without LeaguePals API access or reverse-engineering their internal API calls.

**Workaround:** Weekly standings PDFs are not currently auto-uploaded. The feature is wired into the front-end (`StandingsPdfModal`) but the Drive folder contains no valid PDFs.

See [Standings PDF Download](features/standings-pdf-download.md) for full detail.

## Data Pipeline Is Hardcoded to One Season

**Status:** Known, not urgent
**Affected:** `scripts/fetch-league-data.js`, `scripts/transform-data.js`

`LEAGUE_ID` and the season year/dates are literal constants, not read from Firestore or any config — switching the pipeline to a new season's LeaguePals league still requires editing these scripts by hand. (The previously destructive part — `npm run update-data` wiping the entire `seasons` collection every run — has been fixed; a season staged in advance via the admin Create Season control now survives pipeline runs for the current season.) See [Weekly Data Sync](features/weekly-data-sync.md) for full detail.
