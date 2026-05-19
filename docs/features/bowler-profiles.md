---
feature: Bowler Profiles
number: 5
source-paths:
  - src/pages/BowlersPage.tsx
  - src/components/BowlerProfileModal.tsx
diagram: ../diagrams/features/bowler-profiles.md
status: no diagram
---

## Intent
Provides a directory of all bowlers and lets users view any bowler's game-by-game score history and averages for the current season.

## Key Behaviors
- Browse all bowlers in a sidebar grouped by team, sorted alphabetically within each team
- Click bowler to select them; selection is tracked in the `?id=` URL param
- View aggregate stats (average, entering avg, high game, high series, games played) in the detail panel
- View per-week game scores in a table inside the detail panel (not a modal)

## Conditional Paths
- If bowler has no scores for the selected season, panel shows "No scores recorded yet"
- If loading, page shows "Loading bowlers…" placeholder

## External Dependencies
- Firestore: bowlers, bowlerScores
- SeasonContext

## Known Issues
None

## Notes
BowlersPage renders an inline BowlerDetailPanel (not BowlerProfileModal). BowlerProfileModal is a separate component used by MatchupDetailModal and HomePage for drill-through from matchup rows. useBowlerScores is filtered by bowlerId and seasonYear; scores ordered by week asc.
