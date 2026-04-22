---
id: "phase-6/sub-task-3"
title: "onSnapshot Real-Time Listeners + Docs Update"
phase: 6
task: 3
status: pending
depends_on: ["phase-4/sub-task-1", "phase-4/sub-task-2", "phase-4/sub-task-3", "phase-4/sub-task-4"]
blocks: []
branch: "feature/firebase-firestore-migration"
commit_prefix: "feat(phase-6/task-3)"
estimated_files: 3
---

# Phase 6 / Sub-Task 3: onSnapshot Real-Time Listeners + Docs Update

## Summary

Upgrades the two highest-value real-time data sources — standings and announcements — from
one-shot Firestore reads to `onSnapshot` live listeners. The `useCollection` generic hook already
uses `onSnapshot` internally, so this sub-task simply verifies the behavior is correct, adds any
missing unsubscribe cleanup, and adds CHANGELOG and ROADMAP documentation to close out the migration.

## Implementation Plan

1. **Verify `useCollection` onSnapshot behavior** in `src/hooks/useFirestore.ts`:
   - Confirm `onSnapshot` is being used (not `getDocs`)
   - Confirm the `useEffect` cleanup function calls `unsubscribe()` on unmount
   - Confirm the loading state transitions correctly on first data arrival
   - If `getDocs` was used instead of `onSnapshot` (possible shortcut during earlier phases),
     upgrade to `onSnapshot` now

2. **Identify and verify real-time hooks** are active for:
   - `useTeams(seasonYear)` → standings update live when scores are entered
   - `useAnnouncements()` → pinned announcements update live when admin publishes
   - All other hooks benefit from real-time by default via the generic `useCollection`

3. **Add a `useRealtimeMatchups` hook** (or verify `useMatchups` is already real-time):
   - Standings page and matchup modals should reflect score updates without a page reload
   - Confirm the hook subscription is active for the currently-displayed week

4. **Update `CHANGELOG.md`**:
   - Add a `[Unreleased]` section entry for the entire Firebase migration
   - List all major changes: Firestore integration, Admin CRUD UI, transform pipeline, schema corrections

5. **Update `ROADMAP.md`** (if present):
   - Mark all Firebase migration tasks as `[x]` completed
   - Move the Firebase migration milestone to "Completed Milestones"

6. **Update `firebase-migration-plan.md`** completion status header (add "Completed: YYYY-MM-DD").

## File Operations

### Edit
- `src/hooks/useFirestore.ts` — Verify/upgrade to `onSnapshot` with proper cleanup if needed
- `CHANGELOG.md` — Add [Unreleased] entry documenting the full migration
- `ROADMAP.md` — Mark migration tasks complete (if file exists)

## Dependencies

### Depends On
- `phase-4/sub-task-1` — Standings component must be using hooks before onSnapshot is meaningful
- `phase-4/sub-task-2` — Score/matchup components migrated
- `phase-4/sub-task-3` — Bowler components migrated
- `phase-4/sub-task-4` — Admin display components migrated

### Blocks
- Nothing — this is the final sub-task

## Acceptance Criteria

- [ ] `useCollection` in `src/hooks/useFirestore.ts` uses `onSnapshot` (not `getDocs`)
- [ ] `useEffect` in `useCollection` returns the `unsubscribe` function for cleanup
- [ ] Manual test: editing an announcement in Firestore Console updates the UI without page reload
- [ ] Manual test: standings update live when a team's score is updated in Firestore Console
- [ ] `CHANGELOG.md` has an `[Unreleased]` entry covering all migration changes
- [ ] `npm run build` passes (zero TypeScript errors, zero lint warnings)
- [ ] All 20 sub-tasks in `TASKS.md` have status `completed`

## Commit Convention

`feat(phase-6/task-3): verify onSnapshot real-time listeners and finalize migration documentation`
