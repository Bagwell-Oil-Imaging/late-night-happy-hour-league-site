---
id: "phase-2/sub-task-2"
title: "leagueConfig Collection Mapping"
phase: 2
task: 2
status: pending
depends_on: ["phase-2/sub-task-1"]
blocks: ["phase-2/sub-task-5"]
branch: "feature/firebase-firestore-migration"
commit_prefix: "feat(phase-2/task-2)"
estimated_files: 1
---

# Phase 2 / Sub-Task 2: leagueConfig Collection Mapping

## Summary

Implements the `leagueConfig` Firestore collection population in `scripts/transform-data.js`.
This collection is sourced from `leaguepals-data/league-public.json` and stores all league
business rules (handicap formula, blind score percentage, schedule info) as a versioned document
keyed by `seasonYear`. All handicap calculations in the app reference this document so the formula
is auditable per season.

## Implementation Plan

1. **Read `leaguepals-data/league-public.json`** — Parse the raw LeaguePals API response. Locate
   the relevant fields:
   - `againstBlindScorePct` → `blindScorePct`
   - `numPlayers` → `bowlersPerTeam`
   - `numLanes` → `numLanes`
   - `minGamesforAvg` → `minGamesForAvg`
   - `previousGamesMin` → `prevSeasonMinGames`
   - `weekday` → `weekday`
   - `time` → `startTime`
   - `leagueType` → `leagueType`
   - `dues` → `dues`
   - `entryFee` → `entryFee`
   - `lineage` → `lineage`
   - `paymentWeeks` → `totalWeeks`
   - `positionRounds` → `positionRoundSchedule`
   - `sanction` → `sanctionNumber`
   - `_id` → `leaguePalsId`

2. **Hardcode fields not in the raw API** (sourced from migration plan):
   - `handicapPct: 0.85`
   - `handicapBase: 220` (standard USBC base — verify from league rules)
   - `gamesPerNight: 3`
   - `numTeams: 13`

3. **Determine `seasonYear`** from the fetch script's output or the schedule data. Use `"2025-2026"`.

4. **Write the `populateLeagueConfig(seasonYear)` function** in `scripts/transform-data.js`:
   - Reads and parses `leaguepals-data/league-public.json`
   - Constructs the `leagueConfig` document per the schema in `firebase-migration-plan.md`
   - Calls `batchWrite('leagueConfig', [document])` with document ID = `seasonYear`
   - Uses `db.collection('leagueConfig').doc(seasonYear).set(doc)` (single doc — no batch needed)

5. **Call `populateLeagueConfig('2025-2026')`** in the main transform execution flow.

## File Operations

### Edit
- `scripts/transform-data.js` — Add `populateLeagueConfig(seasonYear)` function and wire into main flow

## Dependencies

### Depends On
- `phase-2/sub-task-1` — `db` reference and `batchWrite()` helper must exist

### Blocks
- `phase-2/sub-task-5` — Final batch write pipeline requires all mappers to be complete

## Acceptance Criteria

- [ ] `populateLeagueConfig()` function exists in `scripts/transform-data.js`
- [ ] Function reads from `leaguepals-data/league-public.json`
- [ ] Document has `seasonYear`, `handicapPct: 0.85`, `blindScorePct`, `bowlersPerTeam`, `gamesPerNight` fields
- [ ] Document uses `seasonYear` string as Firestore document ID
- [ ] All fields match the `leagueConfig` schema from `firebase-migration-plan.md`
- [ ] Function is called in the transform script's main execution flow

## Commit Convention

`feat(phase-2/task-2): implement leagueConfig collection mapping from league-public.json`
