---
feature: Season Schedule
number: 7
source-paths:
  - src/pages/SchedulePage.tsx
diagram: ../diagrams/features/season-schedule.md
status: no diagram
---

## Intent
Shows the full week-by-week schedule for the current season with monthly mini-calendars and an interactive week table.

## Key Behaviors
- View monthly mini-calendars (September 2025 – May 2026) with bowling-date highlights
- View schedule table listing every week with date, notes (skip reason, position round, event), and status badge
- Click a calendar date or "View Matchups" button to open WeekMatchupsModal for that week
- Open standings PDF for completed weeks when available

## Conditional Paths
- If scheduleWeeks collection is empty (season not yet set up), table renders no rows
- Loading state shows "Loading schedule…" placeholder
- Skip weeks show "Off" badge and no "View Matchups" button
- PDF button appears only for completed weeks that have a PDF in the static drive-uploads cache

## External Dependencies
- Firestore: scheduleWeeks ordered by date asc
- SeasonContext for active season year
- WeekMatchupsModal (opened on click) additionally reads: matchupDetails, matchups, teams

## Known Issues
None

## Notes
SchedulePage is not fully read-only — it opens WeekMatchupsModal which shows completed week scoreboards and lets users drill into per-bowler MatchupDetailModal. Calendar months are hardcoded to Sept 2025–May 2026.
