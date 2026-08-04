---
feature: Lane Analytics
number: 8
source-paths:
  - src/pages/LanesPage.tsx
  - src/components/SeasonPlaceholder.tsx
diagram: ../diagrams/features/lane-assignments.md
status: no diagram
---

## Intent
Shows per-lane-pair performance analytics for the season — average scratch series, high scratch, match count, and per-team breakdowns — so bowlers can understand how they and others perform on each pair.

## Key Behaviors
- View SVG lane pair cards with aggregate stats (matches, avg scratch, high scratch)
- Filter lane stats by team using pill buttons
- Filter lane stats further by individual bowler (after selecting a team)
- Click a lane pair card to expand a detail panel with team-by-team or bowler-by-week scores on that pair
- Both team-level and bowler-level drilldowns are available in the expanded detail panel

## Conditional Paths
- If no matchupDetails exist yet, loading state shows "Loading lanes…" placeholder
- If a bowler has no scores on a selected lane pair, empty message shown in detail panel
- Lane cards highlight when a selected team or bowler has appearances on that pair
- If `seasonActive` is false on `settings/global` (between seasons), `LanesPage` renders `SeasonPlaceholder` instead of the lane pair cards and detail panel — checked before the loading state above

## External Dependencies
- Firestore: matchupDetails (lane pair data derived client-side by aggregateLaneData helper), bowlers, bowlerScores

## Known Issues
**Hardcoded season year:** `LanesPage` passes `'2025-2026'` as a literal string to `useMatchupDetails`, `useBowlers`, and `useBowlerScores` (`LanesPage.tsx:315-317`) instead of reading from `useSeasonYear()`. Lane analytics will silently show the wrong season after rollover. Fix: `const seasonYear = useSeasonYear()` and thread it into all three hook calls.

## Notes
LanesPage does NOT show current-week lane assignments. Lane data is aggregated from historical matchupDetails — the `lane` field on TeamSummary identifies which lane each team bowled on each week. No scheduleWeeks or leagueConfig collections are read.
