---
feature: Firestore Data Layer
number: 21
source-paths:
  - src/hooks/useFirestore.ts
  - src/hooks/index.ts
  - src/firebase.ts
diagram: ../diagrams/features/firestore-data-layer.md
status: no diagram
---

## Intent
Provides a consistent, type-safe, real-time data access layer for all 12 Firestore collections so that components never call Firestore directly and query logic stays in one place.

## Key Behaviors
- useCollection<T> opens a real-time Firestore subscription with given query constraints and returns {data, loading, error}
- Auto-unsubscribes on unmount
- useDocument<T> subscribes to a single document by ID
- Domain hooks in index.ts wrap these with collection-specific constraints and TypeScript types

## Conditional Paths
- If a sentinel constraint (where bowlerId == '__never__') is passed, no subscription is opened — prevents unbounded collection fetches when required parameters are not yet available
- If the Firestore document/query doesn't exist, data returns [] or null (not an error)

## External Dependencies
- Firebase/Firestore SDK (onSnapshot, query, collection, doc)
- src/firebase.ts for the db instance
- SeasonContext provides seasonYear to most domain hooks

## Known Issues
None

## Notes
The sentinel pattern (__never__ value) is used consistently across hooks to skip fetches safely. All 19 domain hooks export from src/hooks/index.ts; components import from there, never from useFirestore.ts directly. The full list: useTeams, useTeam, useBowlers, useBowler, useBowlerScores, useBowlerScoresByTeamWeek, useBowlerScoresByWeek, useMatchups, useMatchupDetails, useMatchupDetail, useScheduleWeeks, useSeasons, useSeason, useLeagueConfig, useAnnouncements, useEvents, useCarouselImages, useDocuments, useActiveDocument.
