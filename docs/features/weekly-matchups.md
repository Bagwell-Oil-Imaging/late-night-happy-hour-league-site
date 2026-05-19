---
feature: Weekly Matchups
number: 3
source-paths:
  - src/pages/MatchupsPage.tsx
  - src/components/WeekMatchupsModal.tsx
  - src/components/MatchupDetailModal.tsx
diagram: ../diagrams/features/weekly-matchups.md
status: no diagram
---

## Intent
Shows which teams faced each other each week and lets users drill into the detailed per-bowler, per-game scores for any matchup.

## Key Behaviors
- Select week via WeekSelector
- View grid of team matchups for that week
- Click a matchup to open MatchupDetailModal with game-by-game scores per bowler

## Conditional Paths
- If matchup detail document doesn't exist yet (week not complete), modal shows empty/loading state
- If week has no matchups, grid is empty

## External Dependencies
- Firestore: matchups, matchupDetails, bowlerScores, bowlers
- SeasonContext

## Known Issues
None

## Notes
The Firestore collection for team-aggregate per-week records is `matchupDetails` (not `weeklyMatchupDetails`). MatchupDetailModal uses useMatchupDetail (matchupDetails), useBowlerScoresByTeamWeek (bowlerScores filtered by teamId + week + seasonYear via composite index), and useBowlers (bowlers) to show per-bowler rows including absent/blind roster members.
