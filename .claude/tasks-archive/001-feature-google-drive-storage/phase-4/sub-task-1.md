---
id: "phase-4/sub-task-1"
title: "Standings + Teams + Matchups Components"
phase: 4
task: 1
status: pending
depends_on: ["phase-3/sub-task-2"]
blocks: ["phase-6/sub-task-1", "phase-6/sub-task-3"]
branch: "feature/firebase-firestore-migration"
commit_prefix: "feat(phase-4/task-1)"
estimated_files: 5
---

# Phase 4 / Sub-Task 1: Standings + Teams + Matchups Components

## Summary

Migrates the standings, teams, and matchup display components from static JSON imports to Firestore
hooks. Renames all field references (`team1Score` → `team1ScratchScore`, game totals
`g1`/`g2`/`g3` → `game1Total`/`game2Total`/`game3Total`) and uses the new `Team` and `Matchup`
interfaces. Adds loading/error states to all components using the hook return values.

## Implementation Plan

For each component below, the migration pattern is:
1. Remove the `import data from '../data/X.json'` line
2. Import the relevant domain hook from `src/hooks`
3. Replace the static data variable with `const { data, loading, error } = useXxx(...)`
4. Add a loading state guard (`if (loading) return <div>Loading...</div>`)
5. Rename all field references per the schema changes
6. Update JSDoc comment on the component

### Components to migrate:

**`src/components/LeagueStandings.tsx`**:
- Remove: `import teams from '../data/teams.json'`
- Add: `const { data: teams, loading } = useTeams('2025-2026')`
- Field renames: none expected (teams schema backward-compatible for display fields)
- Note: standings are now sorted by `points DESC` (already correct)

**`src/pages/TeamsPage.tsx`**:
- Remove: `import teams from '../data/teams.json'`
- Add: `const { data: teams, loading } = useTeams('2025-2026')`
- New fields available: `average`, `scratchPins`, `totalPins`, `highGame` — optionally display

**`src/pages/MatchupsPage.tsx`**:
- Remove: `import matchups from '../data/matchups.json'`
- Add: `const { data: matchups, loading } = useMatchups('2025-2026')`
- Rename: `team1Score` → `team1ScratchScore`, `team2Score` → `team2ScratchScore`

**`src/components/WeekMatchupsModal.tsx`**:
- Remove JSON import for matchups
- Add: `const { data: matchups } = useMatchups('2025-2026', week)`
- Rename score fields as above

**`src/components/MatchupDetailModal.tsx`**:
- Remove: `import details from '../data/weeklyMatchupDetails.json'`
- Add: `const { data: detail } = useMatchupDetail(matchupId)`
- Rename `team.g1`/`g2`/`g3` → `team.game1Total`/`game2Total`/`game3Total`
- Rename `team.gameTotals.g1` etc. if present

## File Operations

### Edit
- `src/components/LeagueStandings.tsx` — Replace JSON import with `useTeams` hook
- `src/pages/TeamsPage.tsx` — Replace JSON import with `useTeams` hook
- `src/pages/MatchupsPage.tsx` — Replace JSON import with `useMatchups` hook, rename score fields
- `src/components/WeekMatchupsModal.tsx` — Replace JSON import with `useMatchups` hook
- `src/components/MatchupDetailModal.tsx` — Replace JSON import with `useMatchupDetail` hook, rename game total fields

## Dependencies

### Depends On
- `phase-3/sub-task-2` — Domain hooks must exist

### Blocks
- `phase-6/sub-task-1` — JSON files can only be deleted after all components migrated
- `phase-6/sub-task-3` — onSnapshot can only be added after hook usage is established

## Acceptance Criteria

- [ ] No `import ... from '../data/` JSON imports in any of the 5 files
- [ ] All 5 components use Firestore hooks from `src/hooks`
- [ ] All 5 components render a loading state while data is fetching
- [ ] `team1Score`/`team2Score` references replaced with `team1ScratchScore`/`team2ScratchScore`
- [ ] `g1`/`g2`/`g3` game total references replaced with `game1Total`/`game2Total`/`game3Total`
- [ ] `npm run build` passes with no TypeScript errors in these 5 files

## Commit Convention

`feat(phase-4/task-1): migrate standings, teams, and matchup components to Firestore hooks`
