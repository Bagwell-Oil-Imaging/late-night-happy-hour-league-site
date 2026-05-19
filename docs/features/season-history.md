---
feature: Season History
number: 6
source-paths:
  - src/pages/HistoryPage.tsx
diagram: ../diagrams/features/season-history.md
status: no diagram
---

## Intent
Lets users browse final standings and results from all recorded seasons via an accordion layout.

## Key Behaviors
- View all seasons as collapsible accordion cards, sorted by year desc
- Most recent season is expanded by default on first load
- Click a season card header to expand or collapse it
- View final standings table (rank, team, W/L, points) and champion team name inside expanded card

## Conditional Paths
- If a season has no teams embedded in its document, standings table renders no rows
- If loading, page shows "Loading history…" placeholder

## External Dependencies
- Firestore: seasons only (team data is embedded as a `teams` array within each Season document, not a separate collection query)
- useSeasons hook for season list

## Known Issues
None

## Notes
HistoryPage reads only the `seasons` collection — historical team data is embedded in each Season document as `season.teams[]`, not queried from the `teams` collection. HistoryPage manages its own local season selection state independent of SeasonContext.
