# Handoff: Weekly Standings PDF Downloader

## Goal
Automatically download weekly standings PDFs from LeaguePals after each
Thursday league night and store them in Google Drive for reference in the app.
The final solution should run as a GitHub Actions workflow on a weekly schedule.

---

## What Works Today

`scripts/download-weekly-standings.js` (`npm run standings`) can:
- Log in to LeaguePals via direct API POST to `/login` (no UI form needed)
- Inject the session cookie into Puppeteer
- Navigate to the league-user SPA page and click the Scoring tab
- Find the printer icon and open the PrintStandingsModal
- Download 33 PDFs to `weekly-standings-pdfs/` using `page.pdf()`

**The PDFs download, but they all render the same empty/default page (all
185 KB) because the snapshot IDs are wrong.**

---

## The Core Unsolved Problem: Snapshot IDs

### What a snapshot ID is
Each weekly standings PDF at LeaguePals has a unique MongoDB ObjectId:
```
https://www.leaguepals.com/currentstandings?id=69e99da64f3507543dd2bc94
```
That 24-char hex string is the snapshot ID. Without it, `page.pdf()` renders
a blank/default page.

### Where snapshot IDs DO NOT live
- The raw HTML of `/currentstandings` — page is server-rendered, Angular
  doesn't run client-side there
- Any public LeaguePals API (`getStandingsPublic`, `getTopsPublic`, etc.)
- The Angular `$scope.dates` array on the Scoring tab (week dropdown) —
  these objects have `week: "Week 1"` string labels, not IDs
- The `allWeeks` array in the PrintStandingsModal scope — same problem,
  only labels

### Where snapshot IDs DO live
Snapshot IDs are **created on-demand** when the league admin generates a
standings report. The flow:
1. Admin clicks the printer icon on the Scoring tab
2. `PrintStandingsModal` opens (selects sections to include)
3. Admin clicks the generate/print button
4. Angular POSTs to `/saveCurrentStandings` with week data
5. Server creates a snapshot document, returns its `_id`
6. Angular navigates to `/currentstandings?id=<returned_id>`

The `originalWeeks` scope variable in `LeagueStandingsPrint` (the print page
controller) contains previously-saved snapshot IDs — but only accessible
from within the authenticated SPA flow.

---

## What to Implement Next

### Option A — Intercept the print flow (recommended)
Puppeteer clicks the printer icon, submits the modal for each week, and
intercepts either:
- The POST response from `/saveCurrentStandings` (returns the new snapshot ID)
- The navigation event to `/currentstandings?id=<id>` (capture from URL)

Then call `page.pdf()` on that URL immediately.

**This generates a fresh snapshot per week on each run**, which is fine since
the underlying data doesn't change once the week is posted.

Key code to add inside the modal submit flow:
```javascript
// After opening the modal and selecting a week, intercept the navigation
page.once('request', req => {
  if (req.url().includes('/currentstandings?id=')) {
    const id = new URL(req.url()).searchParams.get('id')
    // save id, then call page.pdf() on that URL
  }
})
// OR intercept the saveCurrentStandings response:
page.on('response', async res => {
  if (res.url().includes('/saveCurrentStandings')) {
    const data = await res.json()
    const snapshotId = data._id || data.data?._id
  }
})
```

### Option B — Collect IDs on first run, cache them
On first authenticated run, click through each week's print modal once to
generate/capture all 30 snapshot IDs. Save them to a JSON file
(`weekly-standings-pdfs/snapshot-ids.json`). On subsequent runs, only
generate the new week's ID.

---

## Architecture Decisions Made

| Decision | Rationale |
|---|---|
| API login (POST /login) not UI form | Angular ng-model doesn't respond to direct `.value=` assignment; API login is simpler and reliable |
| `page.pdf()` instead of `window.print()` | The print page auto-fires `window.print()`; we suppress it and use Puppeteer's PDF renderer directly |
| Personal LeaguePals account | Only league members (admin) have access to the Scoring tab print button and thus snapshot IDs |
| GitHub Actions for scheduling | Vercel functions have 50MB size limit — too tight for Chromium; GH Actions runners have full Chrome with no size constraints |

---

## Credentials & Environment

```
# .env (already set up)
LEAGUEPALS_EMAIL=<personal admin account>
LEAGUEPALS_PASSWORD=<password>

# These will need to be GitHub Actions secrets for production:
# LEAGUEPALS_EMAIL, LEAGUEPALS_PASSWORD
# GOOGLE_SERVICE_ACCOUNT_JSON (for Drive upload — already used in api/upload-to-drive.js)
```

---

## Key LeaguePals Facts Discovered

- `/currentstandings?id=<id>` — server-rendered print page, no client Angular,
  only loads jQuery. Auto-calls `window.print()` on load.
- Angular only runs on `league-user?id=<league_id>` (the full SPA)
- League LEAGUE_ID: `688118301406d3982ec379a1`
- Scoring tab is only visible to logged-in users who are league members
- `PrintStandingsModal` controller injects `allWeeks` and `originalWeeks` as
  resolved dependencies — these come from the parent Scoring controller after
  an API call
- `/saveCurrentStandings` — authenticated POST that creates a snapshot and
  returns its `_id`

---

## Files Changed This Session

| File | Status |
|---|---|
| `scripts/download-weekly-standings.js` | Created — login + PDF download works, snapshot ID extraction incomplete |
| `package.json` | Added `puppeteer` dependency + `"standings"` npm script |
| `weekly-standings-pdfs/` | Created — contains 33 PDFs (all wrong/blank, need real IDs) |

---

## Suggested Next Session Flow

1. Delete the bad PDFs: `rm weekly-standings-pdfs/*.pdf`
2. Implement Option A: intercept `/saveCurrentStandings` response or
   the resulting navigation URL inside the print modal submit
3. Loop over all 30 weeks, submitting the modal once per week to generate
   each snapshot ID, then immediately `page.pdf()` that URL
4. Verify PDFs have different sizes (real content varies week to week)
5. Wire up Google Drive upload (already have `googleapis` + service account
   pattern from `api/upload-to-drive.js`)
6. Build GitHub Actions workflow (`.github/workflows/weekly-standings.yml`)
   with `schedule: cron('0 4 * * 6')` (Friday midnight CT → Saturday 4am UTC)
