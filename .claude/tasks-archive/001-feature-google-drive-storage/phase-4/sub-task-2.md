---
id: "phase-4/sub-task-2"
title: "Scores + Schedule + Seasons Components"
phase: 4
task: 2
status: pending
depends_on: ["phase-3/sub-task-2"]
blocks: ["phase-6/sub-task-1", "phase-6/sub-task-3"]
branch: "feature/firebase-firestore-migration"
commit_prefix: "feat(phase-4/task-2)"
estimated_files: 5
---

# Phase 4 / Sub-Task 2: Scores + Schedule + Seasons Components

## Summary

Migrates score display, schedule, and season history components from static JSON to Firestore hooks.
Key changes: `SeasonScores` and `FutureMatchups` switch from local matchup arrays to `useMatchups`,
`SchedulePage` drops the `dataWeek` field (now uses `week` only), and `LeagueSeasons` uses the
updated `Season` interface with `championTeamId`/`championTeamName` instead of the free-text `champion`.

## Implementation Plan

**`src/components/SeasonScores.tsx`**:
- Remove JSON imports for matchups and weeklyMatchupDetails
- Add: `const { data: matchups } = useMatchups('2025-2026')`
- Add: `const { data: detail } = useMatchupDetail(selectedMatchupId)` (conditional on selection)
- Handle `game1`/`game2`/`game3` may be `null` when bowler was blind — display "-" not "0"
- Rename score fields as in sub-task 1

**`src/components/FutureMatchups.tsx`**:
- Remove JSON import for matchups
- Add: `const { data: matchups } = useMatchups('2025-2026')`
- Filter: `matchups.filter(m => !m.completed)` for upcoming matchups
- Rename score fields

**`src/pages/SchedulePage.tsx`**:
- Remove JSON import for scheduleWeeks
- Add: `const { data: weeks } = useScheduleWeeks('2025-2026')`
- Remove any reference to `week.dataWeek` — use `week.week` only
- Add `positionRound` indicator in the schedule display if `week.positionRound == true`

**`src/components/WeekSelector.tsx`**:
- If it references scheduleWeeks JSON directly, migrate to `useScheduleWeeks` hook
- Remove `dataWeek` references, use `week` field

**`src/pages/HistoryPage.tsx`** and **`src/components/LeagueSeasons.tsx`**:
- Remove seasons JSON import
- Add: `const { data: seasons } = useSeasons()`
- Rename: `season.champion` → display using `season.championTeamName ?? 'TBD'`
- SeasonTeam: `team.id` → `team.teamId`

## File Operations

### Edit
- `src/components/SeasonScores.tsx` — Firestore hooks, handle null game values (show "-")
- `src/components/FutureMatchups.tsx` — Replace matchups JSON with `useMatchups` hook
- `src/pages/SchedulePage.tsx` — Replace scheduleWeeks JSON, remove `dataWeek`, add positionRound indicator
- `src/components/WeekSelector.tsx` — Replace any scheduleWeeks JSON reference
- `src/components/LeagueSeasons.tsx` or `src/pages/HistoryPage.tsx` — Replace seasons JSON, rename champion fields

## Dependencies

### Depends On
- `phase-3/sub-task-2` — Domain hooks must exist

### Blocks
- `phase-6/sub-task-1` — JSON deletion
- `phase-6/sub-task-3` — onSnapshot

## Acceptance Criteria

- [ ] No `import ... from '../data/` JSON imports in any of the 5 files
- [ ] `SeasonScores` displays "-" (not "0") when a bowler's game score is `null`
- [ ] `SchedulePage` does NOT reference `dataWeek` anywhere
- [ ] `LeagueSeasons`/`HistoryPage` uses `season.championTeamName` (not `season.champion`)
- [ ] `positionRound` weeks display a visual indicator in `SchedulePage`
- [ ] All components render a loading state
- [ ] `npm run build` passes with no TypeScript errors in these files

## Commit Convention

`feat(phase-4/task-2): migrate scores, schedule, and seasons components to Firestore hooks`
