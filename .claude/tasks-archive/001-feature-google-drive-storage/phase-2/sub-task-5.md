---
id: "phase-2/sub-task-5"
title: "positionRound + FK Fix + Full Batch Write Pipeline"
phase: 2
task: 5
status: pending
depends_on: ["phase-2/sub-task-2", "phase-2/sub-task-3", "phase-2/sub-task-4"]
blocks: ["phase-6/sub-task-2"]
branch: "feature/firebase-firestore-migration"
commit_prefix: "feat(phase-2/task-5)"
estimated_files: 1
---

# Phase 2 / Sub-Task 5: positionRound + FK Fix + Full Batch Write Pipeline

## Summary

Completes the transform script rework by: (1) implementing `matchups` and `matchupDetails`
population with `positionRound` detection from `splitMatches`, (2) fixing all foreign keys
throughout to use LeaguePals ObjectIds instead of local sequential IDs, (3) removing `dataWeek`
from `scheduleWeeks`, and (4) wiring the full end-to-end pipeline so `npm run update-data`
fetches from LeaguePals and writes all 12 collections to Firestore via batch operations.

## Implementation Plan

1. **Implement `populateMatchups(seasonYear)` function** reading from `leaguepals-data/lane-schedule.json`:
   - For weeks using `matches` array: `positionRound: false`
   - For weeks using `splitMatches` array: `positionRound: true`
   - Store `leaguePalsMatchId: match._id` on each matchup document
   - Use auto-generated Firestore IDs (store returned ID for FK use in `bowlerScores`)
   - `team1ScratchScore`, `team2ScratchScore`: look up from scores data or `null` if upcoming
   - `completed: true` if both teams have scores, else `false`

2. **Implement `populateMatchupDetails(seasonYear)` function**:
   - Mirror document ID to the corresponding `matchups` document ID (1:1 relationship)
   - Map `TeamDetail` → `TeamSummary` with `game1Total`/`game2Total`/`game3Total` (renamed from g1/g2/g3)
   - Preserve `handicapPerGame`, `handicapSeries`, `totalSeries`, `points` fields

3. **Implement `populateScheduleWeeks(seasonYear)` function** reading from `leaguepals-data/lane-schedule.json`:
   - Document ID = ISO date string
   - Remove `dataWeek` field entirely (Issue 7 fix)
   - Set `positionRound: true` for position round weeks
   - Map `status`, `skipReason`, `event`, `week` fields

4. **Fix FK references** throughout the transform script:
   - All `teamId` references must use `team._id` (LeaguePals ObjectId), not the local numeric `id`
   - All `bowlerId` references must use `bowler._id`
   - The `captainBowlerId` on teams remains `null` (admin will set via UI in Phase 5)

5. **Wire the full pipeline** in `main()`:
   ```
   await clearCollection('leagueConfig')
   await populateLeagueConfig(seasonYear)
   await clearCollection('seasons')
   await populateSeasons(seasonYear)
   await clearCollection('scheduleWeeks')
   await populateScheduleWeeks(seasonYear)
   await clearCollection('teams')
   await populateTeams(seasonYear)
   await clearCollection('bowlers')
   await populateBowlers(seasonYear)
   // matchups must be populated before bowlerScores to get matchup IDs
   await clearCollection('matchups')
   const matchupIdMap = await populateMatchups(seasonYear)
   await clearCollection('matchupDetails')
   await populateMatchupDetails(seasonYear, matchupIdMap)
   await clearCollection('bowlerScores')
   await populateBowlerScores(seasonYear, matchupIdMap)
   ```

6. **Test with `npm run update-data`** — confirm no errors and all collections are populated.

## File Operations

### Edit
- `scripts/transform-data.js` — Add `populateMatchups()`, `populateMatchupDetails()`, `populateScheduleWeeks()`, wire full pipeline in `main()`

## Dependencies

### Depends On
- `phase-2/sub-task-2` — leagueConfig mapper must exist
- `phase-2/sub-task-3` — teams/bowlers mappers must exist
- `phase-2/sub-task-4` — bowlerScores mapper must exist

### Blocks
- `phase-6/sub-task-2` — Composite index definitions depend on final schema being stable

## Acceptance Criteria

- [ ] `positionRound: true` set on matchups that come from `splitMatches` in lane-schedule.json
- [ ] `leaguePalsMatchId` populated on every matchup document
- [ ] `dataWeek` field does NOT appear in any `scheduleWeeks` document
- [ ] All `teamId` FKs use LeaguePals ObjectId strings throughout all collections
- [ ] `matchupDetails` document IDs mirror their corresponding `matchups` document IDs
- [ ] `npm run update-data` completes without errors
- [ ] `game1Total`/`game2Total`/`game3Total` field names used in matchupDetails (not `g1Total`)
- [ ] All 12 collections populated after a full `update-data` run

## Commit Convention

`feat(phase-2/task-5): complete transform pipeline with positionRound, FK fix, and full batch writes`
