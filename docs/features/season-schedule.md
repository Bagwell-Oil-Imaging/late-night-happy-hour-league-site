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
- View schedule table listing every week with date, notes (skip reason, position round, event), status badge, and a "Matchups" column header above the action buttons; skip reason repeats under the date on mobile since the Notes column itself is hidden below 768px
- Below 768px the table switches to `table-layout: fixed` with tighter, wrap-friendly columns so it fits the viewport without a horizontal scrollbar
- Click a calendar date or "View Matchups" button to open WeekMatchupsModal for that week
- Open standings PDF for completed weeks when available
- Between seasons, previews the upcoming season's schedule (`settings/global.upcomingSeasonYear`) instead of the just-finished season's, with a banner noting nothing has been played yet

## Conditional Paths
- If scheduleWeeks collection is empty (season not yet set up), table renders no rows
- Loading state shows "Loading schedule…" placeholder
- Skip weeks show "Off" badge and no "View Matchups" button
- PDF button appears only for completed weeks that have a PDF in the static drive-uploads cache
- If `seasonActive` is false on `settings/global` (between seasons): shows the upcoming season's schedule + a preview banner when `upcomingSeasonYear` is set and `scheduleWeeks` exists for it; falls back to `SeasonPlaceholder` when `upcomingSeasonYear` is unset or nothing has been staged yet — never falls back to re-showing the just-finished season's own schedule

## External Dependencies
- Firestore: scheduleWeeks ordered by date asc, for whichever season year is being displayed
- SeasonContext for active season year, `seasonActive`, and `upcomingSeasonYear`
- WeekMatchupsModal (opened on click) additionally reads: matchupDetails, matchups, teams — scoped to the same displayed season year via its `seasonYear` prop

## Known Issues
None

## Notes
SchedulePage is not fully read-only — it opens WeekMatchupsModal which shows completed week scoreboards and lets users drill into per-bowler MatchupDetailModal. Calendar month range is derived from `scheduleWeeks` dates (min→max month), not hardcoded — this is what makes previewing a different season's schedule (the upcoming one, between seasons) work correctly.
