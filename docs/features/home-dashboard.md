---
feature: Home Dashboard
number: 1
source-paths:
  - src/pages/HomePage.tsx
  - src/components/AwardLeaders.tsx
---

## Intent
Surfaces current league status at a glance — a recap/preview scoreboard for the most recent and next weeks, individual and team week highlights, nav cards, full standings table, and half-season award leaders.

## Key Behaviors
- Toggle between "Week N Recap" (completed week scoreboard) and "Week N+1 Preview" (upcoming matchup pairings with team records); the preview is hidden after the final week configured in `leagueConfig.totalWeeks`
- Use Previous/Next controls around the recap tab to browse completed, publicly visible weeks; the latest completed week remains the default and navigation updates the scoreboard, highlights, playoff bracket, PDF shortcut, and detail link together
- View top-3 individual and team high game/series highlights for the selected recap week
- Click a matchup row to open MatchupDetailModal for per-bowler breakdown
- View full standings table (via LeagueStandings component)
- View half-season award leaders (via AwardLeaders component)
- Open standings PDF for the latest week when one is available

## Conditional Paths
- If no matchupDetails exist yet, recap/preview panels show loading state
- Latest recap week is determined by `matchups.filter(m => m.completed)` max week — a week where `npm run fetch` ran before scores were entered in LeaguePals will NOT appear as the recap; it shows the prior week instead
- If the next configured week has no unfinished matchups, Preview panel shows an empty message
- If the latest completed week is the configured final week, no following-week Preview tab or panel is rendered
- AwardLeaders shows "Upcoming" status badge for the second half until any week in that range completes

## External Dependencies
- Firestore: matchupDetails, matchups, teams, bowlers, bowlerScores, scheduleWeeks, seasons
- SeasonContext for active season year
- useBowlerScoresByWeek hook filters to non-blinded scores for individual highlights
- AwardLeaders additionally reads bowlers, matchupDetails, scheduleWeeks via its own hooks

## Known Issues
None

## Notes
Carousel component is NOT rendered on HomePage — it is not used here. Announcements badge lives in Header, not HomePage. LeagueStandings uses a hardcoded season year ('2025-2026') rather than SeasonContext.
