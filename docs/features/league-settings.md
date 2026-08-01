---
feature: League Settings
number: 17
source-paths:
  - src/pages/admin/SettingsAdmin.tsx
  - src/utils/handicap.js
diagram: ../diagrams/features/league-settings.md
status: no diagram
---

## Intent
Allows admins to configure the active season year, which controls which season's data is shown across the entire public site, and to toggle whether the league is currently in-season (driving the public homepage's between-seasons landing view).

## Key Behaviors
- View the currently active season year
- Select a new active season from a dropdown populated by the seasons Firestore collection
- Save updates settings/global with the selected season year
- Save button is disabled until the selection differs from the current saved value
- Change takes effect immediately for all visitors via the SeasonContext real-time Firestore listener
- **Season Status card**: toggle between "In Season" and "Between Seasons"; when between seasons, enter the upcoming season's year (`YYYY-YYYY`) so the homepage countdown knows which season's schedule to read Week 1 from
- Season Status save button is independently disabled until either the toggle or the upcoming-season field differs from the saved value
- **Create Season card**: stages a brand-new season by writing `seasons/{year}` and `leagueConfig/{year}` documents with defaults matching the LeaguePals import pipeline's own no-API-data fallback (`scripts/transform-data.js` `populateLeagueConfig`), so it behaves identically to a season the pipeline creates from scratch
- Create Season takes a season-year selector (auto-generated sequential, non-overlapping options following the latest existing season, e.g. 2026-2027, 2027-2028, 2028-2029) and a total-weeks selector (20-40, defaults to 32); the resulting season immediately appears in the Active Season and Season Details dropdowns for schedule building
- On successful creation, the new year is auto-selected in the Season Details preview so the admin can jump straight to building its schedule
- The Team Difference handicap formula floors both teams' average totals before subtracting them, applies the configured percentage to that integer difference, then floors the final handicap

## Conditional Paths
- If settings/global document doesn't exist, the dropdown initialises with no pre-selected value
- If no seasons exist in the seasons collection, dropdown shows "No seasons available"
- Save uses setDoc with merge: true so any future settings fields are preserved
- Success shows an inline confirmation message; error shows an inline error message
- Upcoming-season field is only shown/editable when the toggle is set to "Between Seasons"; saving with the toggle set to "In Season" always writes `upcomingSeasonYear: null`
- Upcoming-season input is validated client-side against `YYYY-YYYY` before saving; a non-matching value blocks save with an inline error
- Create Season's year selector only ever offers valid, sequential, non-overlapping years by construction; a server-side check (local-bypass path) still rejects a year that already has a `seasons/{year}` document as defense in depth

## External Dependencies
- Firestore: settings (read/write — document ID is "global", fields `currentSeasonYear`, `seasonActive`, `upcomingSeasonYear`)
- Firestore: seasons (read/write — useSeasons hook populates the season dropdowns; Create Season writes a new document)
- Firestore: leagueConfig (write — Create Season writes a new document)
- Local admin bypass: `set-active-season`, `set-season-status`, and `create-season` operations in `api/local-admin-write.js`
- Firebase Auth (route guard)

## Known Issues
None

## Notes
The Firestore path is settings/global, not leagueConfig. The leagueConfig collection stores per-season league configuration used by the pipeline and public pages; SettingsAdmin only manages the active season pointer in settings/global.

The upcoming-season year entered in Season Status does not by itself produce a countdown — the homepage countdown needs that season's `scheduleWeeks` (specifically a `week === 1` entry) to exist. Create Season plus the existing Season Details schedule builder (see `season-details.md`) together provide that: Create Season stages the `seasons`/`leagueConfig` docs so the season appears in the Season Details dropdown, then the schedule builder produces the `scheduleWeeks` the countdown reads from.

Create Season deliberately does not set `Season.startDate`/`endDate` (left as empty strings until the schedule is built) and writes `teams: []`; `HistoryPage` filters out any season with an empty `teams` array so a staged-but-unplayed season never appears in the public League History list (see `season-history.md`).
