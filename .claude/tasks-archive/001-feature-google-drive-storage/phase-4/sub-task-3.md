---
id: "phase-4/sub-task-3"
title: "Bowler Components"
phase: 4
task: 3
status: pending
depends_on: ["phase-3/sub-task-2"]
blocks: ["phase-6/sub-task-1", "phase-6/sub-task-3"]
branch: "feature/firebase-firestore-migration"
commit_prefix: "feat(phase-4/task-3)"
estimated_files: 3
---

# Phase 4 / Sub-Task 3: Bowler Components

## Summary

Migrates the bowler-related components from `bowlerStats.json` to Firestore hooks. The old
`BowlerStat` type (with embedded `weeks` array) is replaced by two separate collections: `bowlers`
(identity + aggregate stats) and `bowlerScores` (per-week performance). Components are updated to
use `useBowlers()` and `useBowlerScores()` separately, and display logic handles `null` game values
for blinded weeks.

## Implementation Plan

**`src/pages/BowlersPage.tsx`**:
- Remove: `import bowlerStats from '../data/bowlerStats.json'`
- The old import wrapped data in `{ data: [] }` — this is now irrelevant
- Add: `const { data: bowlers, loading } = useBowlers('2025-2026')`
- Update display to use new fields: `bowler.firstName`, `bowler.lastName` (or `bowler.name`),
  `bowler.teamName`, `bowler.average`, `bowler.highSeries`, `bowler.highGame`
- Remove references to `bowler.teamId` as a numeric ID — it's now a string ObjectId

**`src/components/BowlerProfileModal.tsx`**:
- Replace `BowlerStat` type with `Bowler` + separate `BowlerScore[]`
- Add: `const { data: scores, loading: scoresLoading } = useBowlerScores(bowler.leaguePalsId, '2025-2026')`
- In the scores table, replace `week.g1`/`week.g2`/`week.g3` → `score.game1`/`score.game2`/`score.game3`
- Display `"-"` instead of `"0"` when a game score is `null` (blinded week)
- Display "Pre-bowl" badge when `score.preBowled == true`
- Display `score.actualBowlDate` as supplementary info when pre-bowled

**`src/components/AwardLeaders.tsx`**:
- Remove: any JSON import for bowler stats
- Add: `const { data: bowlers, loading } = useBowlers('2025-2026')`
- Award categories use: `bowler.highGame`, `bowler.highSeries`, `bowler.average` (all now top-level fields)
- Also use `bowler.highGameHdcp`, `bowler.highSeriesHdcp` for handicap award categories if displayed

## File Operations

### Edit
- `src/pages/BowlersPage.tsx` — Replace bowlerStats.json import with `useBowlers` hook
- `src/components/BowlerProfileModal.tsx` — Split into `Bowler` + `BowlerScore[]` data sources, handle null games
- `src/components/AwardLeaders.tsx` — Replace bowlerStats.json import with `useBowlers` hook

## Dependencies

### Depends On
- `phase-3/sub-task-2` — `useBowlers` and `useBowlerScores` hooks must exist

### Blocks
- `phase-6/sub-task-1` — JSON deletion
- `phase-6/sub-task-3` — onSnapshot

## Acceptance Criteria

- [ ] No `import ... from '../data/bowlerStats.json'` in any of the 3 files
- [ ] `BowlerProfileModal` loads bowler scores via `useBowlerScores(bowlerId, seasonYear)`
- [ ] `BowlerProfileModal` displays "-" for null game scores (blinded weeks)
- [ ] `BowlerProfileModal` displays a visual indicator for pre-bowl scores
- [ ] `AwardLeaders` uses top-level `bowler.highGame` / `bowler.highSeries` fields
- [ ] `AwardLeaders` can display handicap leaders using `highGameHdcp` / `highSeriesHdcp`
- [ ] `BowlersPage` uses `bowler.name` (or `firstName + lastName`) from the new `Bowler` type
- [ ] All 3 components have loading states
- [ ] `npm run build` passes with no TypeScript errors in these 3 files

## Commit Convention

`feat(phase-4/task-3): migrate bowler components to Firestore hooks with null game handling`
