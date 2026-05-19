---
feature: Team Roster
number: 4
source-paths:
  - src/pages/TeamsPage.tsx
diagram: ../diagrams/features/team-roster.md
status: no diagram
---

## Intent
Lets users browse all teams in the league, see their season stats and week-by-week results, and explore per-lane-pair performance analytics.

## Key Behaviors
- View ranked sidebar of all teams sorted by points
- Select a team to see season summary (W/L/T, points, win%, color-coded outcome track)
- Expand a week card to see the full per-bowler score breakdown vs the opponent
- View Lane Analytics section showing per-lane-pair stats, filterable by team
- Open standings PDF for a specific week from an expanded week card

## Conditional Paths
- If no matchupDetails exist yet, detail panel shows "No match data available yet"
- If loading, page shows "Loading teams…" placeholder
- Expanded week card uses WeekCardDetail which fetches bowlerScores and bowler rosters lazily on expand

## External Dependencies
- Firestore: teams, matchupDetails, matchups, bowlerScores, bowlers
- TeamsPage uses hardcoded season year '2025-2026' (not SeasonContext)

## Known Issues
None

## Notes
TeamsPage does not show a per-team bowler roster list or open a BowlerProfileModal. Bowler data (useBowlers, useBowlerScoresByTeamWeek) is fetched inside the WeekCardDetail sub-component, which is only mounted when a week card is expanded. Lane Analytics are derived from matchupDetails via the aggregateLaneData helper exported from LanesPage.
