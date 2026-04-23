---
id: "phase-3/sub-task-2"
title: "Firestore Hooks (Generic + Domain)"
phase: 3
task: 2
status: completed
depends_on: ["phase-3/sub-task-1", "phase-1/sub-task-1"]
blocks: ["phase-4/sub-task-1", "phase-4/sub-task-2", "phase-4/sub-task-3", "phase-4/sub-task-4"]
branch: "feature/firebase-firestore-migration"
commit_prefix: "feat(phase-3/task-2)"
estimated_files: 2
---

# Phase 3 / Sub-Task 2: Firestore Hooks (Generic + Domain)

## Summary

Creates `src/hooks/useFirestore.ts` with two generic hooks (`useCollection` and `useDocument`) that
return typed Firestore query results with loading/error states. Then creates `src/hooks/index.ts`
with all domain-specific hooks (one per collection) that encapsulate query logic, filtering, and
ordering. Components will import only domain hooks, never the generic ones directly.

## Implementation Plan

1. **Create `src/hooks/useFirestore.ts`** with two generic hooks:

   ```typescript
   // useCollection<T> — subscribes to a Firestore collection query
   // Returns: { data: T[], loading: boolean, error: Error | null }
   // Uses onSnapshot for real-time updates (upgradeable to one-shot in Phase 6 for specific hooks)
   function useCollection<T>(
     collectionName: string,
     constraints?: QueryConstraint[]
   ): { data: T[]; loading: boolean; error: Error | null }

   // useDocument<T> — subscribes to a single Firestore document
   // Returns: { data: T | null, loading: boolean, error: Error | null }
   function useDocument<T>(
     collectionName: string,
     docId: string
   ): { data: T | null; loading: boolean; error: Error | null }
   ```

   Both hooks add the Firestore document `id` to each returned object automatically.
   Both hooks clean up the `onSnapshot` listener on unmount.

2. **Create `src/hooks/index.ts`** with domain hooks. Each encapsulates its query constraints:

   ```typescript
   // useTeams(seasonYear) → Team[]
   // useTeam(leaguePalsId) → Team | null
   // useBowlers(seasonYear, teamId?) → Bowler[]
   // useBowler(leaguePalsId) → Bowler | null
   // useBowlerScores(bowlerId, seasonYear?) → BowlerScore[]
   // useMatchups(seasonYear, week?) → Matchup[]
   // useMatchupDetail(matchupId) → MatchupDetail | null
   // useScheduleWeeks(seasonYear) → ScheduleWeek[]
   // useSeasons() → Season[]
   // useSeason(year) → Season | null
   // useLeagueConfig(seasonYear) → LeagueConfig | null
   // useAnnouncements() → Announcement[]  -- filters expired (expiresAt > today OR null), sorts pinned first
   // useEvents() → Event[]  -- sorted by date ASC
   // useCarouselImages() → CarouselImage[]  -- sorted by order ASC
   // useDocuments(type, seasonYear?) → LeagueDocument[]  -- filters active == true
   // useActiveDocument(type, seasonYear) → LeagueDocument | null
   ```

3. **Implement the `expiresAt` filter** in `useAnnouncements()`:
   - Firestore cannot filter `expiresAt == null OR expiresAt > today` in a single query
   - Solution: fetch all announcements without expiresAt filter, then filter in JS:
     `data.filter(a => !a.expiresAt || a.expiresAt > new Date().toISOString().split('T')[0])`
   - Sort: `pinned DESC, priority DESC, date DESC` (in JS after fetch)

4. **Add `src/hooks/` to tsconfig paths** if necessary (usually not needed for relative imports).

## File Operations

### Add
- `src/hooks/useFirestore.ts` — Generic `useCollection<T>` and `useDocument<T>` hooks
- `src/hooks/index.ts` — All 16 domain-specific hooks re-exporting from `useFirestore`

## Dependencies

### Depends On
- `phase-3/sub-task-1` — All hook return types depend on the new interfaces
- `phase-1/sub-task-1` — `src/firebase.ts` exports `db` that hooks import

### Blocks
- `phase-4/sub-task-1` through `phase-4/sub-task-4` — All component migration depends on these hooks

## Acceptance Criteria

- [ ] `src/hooks/useFirestore.ts` exports `useCollection<T>` and `useDocument<T>`
- [ ] Both generic hooks handle `loading: true` initial state and `error` state
- [ ] Both generic hooks unsubscribe `onSnapshot` on component unmount
- [ ] `src/hooks/index.ts` exports all 16 domain hooks listed above
- [ ] `useAnnouncements()` filters out expired announcements in JavaScript
- [ ] `useAnnouncements()` sorts by `pinned DESC, priority DESC, date DESC`
- [ ] `useCarouselImages()` sorts by `order ASC`
- [ ] `useActiveDocument(type, seasonYear)` returns only the document with `active == true`
- [ ] All domain hooks are typed against interfaces from `src/types/index.ts`
- [ ] `npm run build` passes (component type errors from Phase 3 sub-task 1 may persist — acceptable)

## Commit Convention

`feat(phase-3/task-2): create generic Firestore hooks and all domain collection hooks`
