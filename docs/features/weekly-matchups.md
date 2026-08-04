---
feature: Weekly Matchups
number: 3
source-paths:
  - src/pages/MatchupsPage.tsx
  - src/components/WeekMatchupsModal.tsx
  - src/components/MatchupDetailModal.tsx
  - src/components/SeasonPlaceholder.tsx
diagram: ../diagrams/features/weekly-matchups.md
status: no diagram
---

## Intent
Shows which teams faced each other each week and lets users drill into the detailed per-bowler, per-game scores for any matchup.

## Key Behaviors
- Select week via WeekSelector
- View grid of team matchups for that week
- Click a matchup to open MatchupDetailModal with game-by-game scores per bowler
- The per-bowler Avg column and team handicap use the stored `avgBeforeThisWeek`; legacy documents without it use a best-effort rolling-average fallback until re-ingested

## Conditional Paths
- If matchup detail document doesn't exist yet (week not complete), modal shows empty/loading state
- If week has no matchups, grid is empty
- If `seasonActive` is false on `settings/global` (between seasons), `MatchupsPage` renders `SeasonPlaceholder` instead of the week selector, bracket, and scoreboard

## External Dependencies
- Firestore: matchups, matchupDetails, bowlerScores, bowlers
- SeasonContext

## Known Issues
**Hardcoded season year:** `MatchupsPage` and `MatchupDetailModal` pass `'2025-2026'` as a literal string to Firestore hooks instead of reading from `useSeasonYear()`. Matchup data will silently show the wrong season after rollover. Affected call site: `MatchupsPage.tsx:85`. Fix: `const seasonYear = useSeasonYear()` in each component and thread it into all hook calls. (`WeekMatchupsModal` no longer hardcodes this — it now takes a `seasonYear` prop from its caller, threaded through so `SchedulePage` can preview the upcoming season's matchup data between seasons.)

## Notes
The Firestore collection for team-aggregate per-week records is `matchupDetails` (not `weeklyMatchupDetails`). MatchupDetailModal uses useMatchupDetail (matchupDetails), useBowlerScoresByTeamWeek (bowlerScores filtered by teamId + week + seasonYear via composite index), and useBowlers (bowlers) to show per-bowler rows including absent/blind roster members.
