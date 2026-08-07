---
feature: Season Schedule
number: 7
source-paths:
  - src/pages/SchedulePage.tsx
  - src/components/SeasonPlaceholder.tsx
diagram: ../diagrams/features/season-schedule.md
status: no diagram
---

## Intent
Shows the full week-by-week schedule for the active (or, between seasons, upcoming) season with monthly mini-calendars and an interactive week table.

## Key Behaviors
- View monthly mini-calendars, dynamically ranged to span the displayed season's own schedule dates, with bowling-date highlights; play-week cells show the league week number below the date, colored by status
- Skip weeks show a red X over the date; hover (desktop) or tap/focus (mobile, keyboard) reveals the skip reason in a tooltip
- View schedule table listing every week with date, notes (skip reason, position round, admin-entered multi-line week note from Season Details — rendered with line breaks preserved via `white-space: pre-line`), status badge, and a "Matchups" column header above the action buttons; skip reason repeats under the date on mobile since the Notes column itself is hidden below 768px
- Below 768px the table switches to `table-layout: fixed` with tighter, wrap-friendly columns so it fits the viewport without a horizontal scrollbar
- Click a calendar date or "View Matchups" button to open WeekMatchupsModal for that week
- Open standings PDF for completed weeks when available
- Play weeks tagged with a `ScheduleWeek.specialEvent` (set in Season Details) show a `ScheduleEventBadge` — a bronze/silver/gold trophy (playoffs week 1 / week 2 / half championship) or a gold crown (league championship). Renders in the monthly mini-calendar cell (top-right corner), and inline in the schedule table's Notes column as part of a single **info card** (`.sch-info-card`) that groups the event badge, the position-round tag, the skip reason, and the free-text note into one bordered block instead of separate floating elements — so a row with several of these still reads as one visual unit rather than a badge orphaned above an unrelated box. Inside the card the badge sits to the left of the text column (`.sch-info-text`), not stacked above it. The first-half and second-half variants of a given tag (e.g. playoffs week 1) render identically — the metal color alone distinguishes week 1/2/championship, not text — since the badge's hover/aria title still carries the full label (e.g. "First Half Playoffs — Week 1") for anyone who needs it
- The weekly dues `$` badge sits in a flex row next to the date (`.sch-date-row`) rather than relying on inline `vertical-align`, so it's reliably centered against the date text regardless of font metrics
- Below 768px the Notes column is hidden entirely (no room), so its content moves into the Date column: the event badge gets a small always-visible copy next to the date, and a tap-to-expand note button (shown whenever the row has a position-round tag, a note, or — for non-skip rows — a skip reason) reveals the same content in a compact card underneath the date. Skip rows don't get the button for their own skip reason since that's already shown via the existing always-visible mobile skip-reason line; the button only appears there for a position-round tag or note
- On that same mobile row, the date stays left-aligned and its badges are pushed to the right edge of the column (`.sch-date-row` / `.sch-date-icons`), rather than the date and badges centering together as one block. Left to right within that group: event badge, note button, dues badge (rightmost)
- Non-skip weeks whose `ScheduleWeek.duesOwed` is not explicitly `false` show a small `$` dues indicator next to the date (defaults to shown — missing the field means owed, matching pre-feature records); hover (desktop) or tap/focus (mobile, keyboard) reveals "Each team owes $X for week Y, ($Z per bowler)" inline below the date, where X = `leagueConfig.bowlersPerTeam × leagueConfig.lineage` and Z = `leagueConfig.lineage`. Hidden entirely when either value is unset/zero, or when the admin unchecked "Dues?" for that week in Season Details (e.g. a banquet night). Revealed inline (not a floating tooltip) because `.schedule-table-shell` clips vertical overflow to keep its rounded corners, which would cut off a popup for rows near the top or bottom of the table
- Between seasons, previews the upcoming season's schedule (`settings/global.upcomingSeasonYear`) instead of the just-finished season's, with a banner noting nothing has been played yet

## Conditional Paths
- If scheduleWeeks collection is empty (season not yet set up), table renders no rows
- Loading state shows "Loading schedule…" placeholder
- Skip weeks show "Off" badge and no "View Matchups" button
- PDF button appears only for completed weeks that have a PDF in the static drive-uploads cache
- If `seasonActive` is false on `settings/global` (between seasons): shows the upcoming season's schedule + a preview banner when `upcomingSeasonYear` is set and `scheduleWeeks` exists for it; falls back to `SeasonPlaceholder` when `upcomingSeasonYear` is unset or nothing has been staged yet — never falls back to re-showing the just-finished season's own schedule

## External Dependencies
- Firestore: scheduleWeeks ordered by date asc, for whichever season year is being displayed
- Firestore: leagueConfig (read — `useLeagueConfig`, provides `bowlersPerTeam` and `lineage` for the dues indicator)
- SeasonContext for active season year, `seasonActive`, and `upcomingSeasonYear`
- WeekMatchupsModal (opened on click) additionally reads: matchupDetails, matchups, teams — scoped to the same displayed season year via its `seasonYear` prop

## Known Issues
None

## Notes
SchedulePage is not fully read-only — it opens WeekMatchupsModal which shows completed week scoreboards and lets users drill into per-bowler MatchupDetailModal. Calendar month range is derived from `scheduleWeeks` dates (min→max month), not hardcoded — this is what makes previewing a different season's schedule (the upcoming one, between seasons) work correctly.
