# Known Issues

Active unresolved problems. Remove an entry when fixed and add a CHANGELOG.md entry instead.

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

---

## Hardcoded Season Year in MatchupsPage and TeamsPage

**Status:** Known, not urgent  
**Affected:** `src/pages/MatchupsPage.tsx`, `src/pages/TeamsPage.tsx`

Both pages pass `'2025-2026'` as a literal string to their Firestore hooks instead of reading from `useSeasonYear()`. Matchup and team data will silently display the wrong season after rollover without any error. Fix: add `const seasonYear = useSeasonYear()` in each page and thread it into all hook calls. See [Weekly Matchups](features/weekly-matchups.md) and [Team Roster](features/team-roster.md) for details.

---

## Duplicate ScoresTable in Bowler Profiles

**Status:** Known, not urgent  
**Affected:** `src/pages/BowlersPage.tsx`, `src/components/BowlerProfileModal.tsx`

Two separate inline score-history table implementations exist instead of a shared component — one inside the inline `BowlerDetailPanel` on `BowlersPage` and one inside `BowlerProfileModal`. Fixes to score display logic must be applied in both places. See [Bowler Profiles](features/bowler-profiles.md) for details.

---

## Bundle Size

**Status:** Known, not urgent  
**Affected:** Production build

The JS bundle is ~858 KB minified (216 KB gzipped). Code-splitting with dynamic imports on route boundaries would reduce initial load. Not blocking but worth addressing before the site grows further.
