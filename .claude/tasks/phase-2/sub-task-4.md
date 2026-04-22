---
id: "phase-2/sub-task-4"
title: "bowlerScores: Blind/PreBowl/Substitute Detection"
phase: 2
task: 4
status: pending
depends_on: ["phase-2/sub-task-1"]
blocks: ["phase-2/sub-task-5"]
branch: "feature/firebase-firestore-migration"
commit_prefix: "feat(phase-2/task-4)"
estimated_files: 1
---

# Phase 2 / Sub-Task 4: bowlerScores: Blind/PreBowl/Substitute Detection

## Summary

Implements the corrected `bowlerScores` collection mapping with proper blind game detection and
pre-bowl detection. The existing transform used fragile average-comparison logic; this sub-task
replaces it with the authoritative LeaguePals data: the `"-"` string marker for absent games and
the `isMatch` boolean for pre-bowl detection. Absent game scores are stored as `null` (not `0`)
to prevent corrupting aggregate queries.

## Implementation Plan

1. **Implement `populateBowlerScores(seasonYear)` function** reading from each
   `leaguepals-data/teams/{id}.json` (same source as `populateBowlers()`):

   For each bowler, iterate their `weekGames` object (keyed by date string):
   ```
   weekGames: {
     "2025-09-04": {
       isMatch: true,
       games: [123, 145, 167]    // or ["-", "-", "-"] when absent
     }
   }
   ```

   For each week entry, construct a `bowlerScore` document:
   - `bowlerId: bowler._id` (LeaguePals ObjectId)
   - `bowlerName: bowler.firstName + ' ' + bowler.lastName`
   - `teamId: team._id`
   - `teamName: team.name`
   - `opponentTeamId` / `opponentTeamName`: look up opponent from lane schedule (requires cross-referencing `leaguepals-data/lane-schedule.json`)
   - `matchupId`: left as empty string `""` for now — Phase 2 sub-task 5 wires FKs
   - `seasonYear`
   - `week`: derive from scheduled date → week number mapping (build a lookup from `leaguepals-data/lane-schedule.json`)
   - `date`: the scheduled match date (YYYY-MM-DD)
   - `actualBowlDate`: if `isMatch == false`, store the bowl date; else `null`

2. **Blind detection** (Issue 3 fix):
   - `blinded = games.some(g => g === "-")`
   - If `blinded == true`: `game1 = null`, `game2 = null`, `game3 = null`, `series = null`
   - If `blinded == false`: `game1 = games[0]`, `game2 = games[1]`, `game3 = games[2]`, `series = sum`

3. **Pre-bowl detection** (Issue 16 fix):
   - `preBowled = weekGames[date].isMatch === false`
   - If `preBowled == true`: `actualBowlDate = bowlDate` (the date key from weekGames), `date = scheduledMatchDate` (the week it COUNTS FOR)
   - If `preBowled == false`: `actualBowlDate = null`

4. **Substitute tracking** (Issue 15 fix):
   - `isSubstitute = false`, `substituteFor = null` initially
   - If the bowler's `_id` is NOT in the expected roster for that team week, flag as substitute (this heuristic may need refinement — add a TODO comment)
   - Note: Full substitute detection may require manual admin input; set `isSubstitute: false` for all initially and document the limitation

5. **Lane pair assignment**:
   - Cross-reference with lane schedule to get `lanePair` (odd lane number)

6. **Wire `populateBowlerScores()`** into the main transform flow.

## File Operations

### Edit
- `scripts/transform-data.js` — Add `populateBowlerScores()` function

## Dependencies

### Depends On
- `phase-2/sub-task-1` — `db`, `batchWrite()` must exist

### Blocks
- `phase-2/sub-task-5` — FK wiring and full pipeline

## Acceptance Criteria

- [ ] `blinded: true` when `weekGames.games` contains `"-"` values
- [ ] `game1`, `game2`, `game3` are `null` (not 0) when `blinded == true`
- [ ] `series` is `null` when `blinded == true`
- [ ] `preBowled: true` when `weekGames[date].isMatch === false`
- [ ] `actualBowlDate` is `null` when `preBowled == false`
- [ ] `isSubstitute` and `substituteFor` fields are always present (default `false`/`null`)
- [ ] No game score of `0` appears in the database when a bowler was absent
- [ ] `game1`/`game2`/`game3` field names used (not `g1`/`g2`/`g3`)

## Commit Convention

`feat(phase-2/task-4): fix bowlerScores blind detection using "-" marker and isMatch flag`
