---
id: "phase-2/sub-task-3"
title: "Expanded Teams + Bowlers Mapping"
phase: 2
task: 3
status: pending
depends_on: ["phase-2/sub-task-1"]
blocks: ["phase-2/sub-task-5"]
branch: "feature/firebase-firestore-migration"
commit_prefix: "feat(phase-2/task-3)"
estimated_files: 1
---

# Phase 2 / Sub-Task 3: Expanded Teams + Bowlers Mapping

## Summary

Implements richer `teams` and `bowlers` Firestore collection mappings in `scripts/transform-data.js`.
`teams` gains all standings stats currently discarded (average, scratchPins, totalPins, pctWon, maxGame,
pointsWon, pointsLost). `bowlers` gains firstName/lastName, avatarUrl, handicap high games/series,
gamesPlayed, blind week counts, and individual match points — all sourced from the LeaguePals raw data
that the existing script was throwing away.

## Implementation Plan

1. **Implement `populateTeams(seasonYear)` function** reading from `leaguepals-data/standings.json`:
   - Map each standings entry to the `teams` schema:
     - `leaguePalsId: team._id` (MongoDB ObjectId string) — use as Firestore document ID
     - `displayId: index + 1` (standings rank, 1-based)
     - `seasonYear`
     - `name`, `captainName` (from standings data)
     - `captainBowlerId: null` (Phase 5 admin sets this)
     - `wins`, `losses`, `ties`, `points` (from standings)
     - `pointsWon`, `pointsLost` (from standings)
     - `pctWon: parseFloat(team.pctWon)` (LeaguePals returns string "48.21" — parse to float)
     - `average: team.average`
     - `scratchPins: team.scratchPins`
     - `totalPins: team.totalPins`
     - `highGame: team.maxGame`
   - Call `batchWrite('teams', docs)` using LeaguePals ObjectId as document ID

2. **Implement `populateBowlers(seasonYear)` function** reading from each `leaguepals-data/teams/{id}.json`:
   - For each bowler in the team's `players` array:
     - `leaguePalsId: bowler._id` — Firestore document ID
     - `seasonYear`
     - `teamId: team._id` (LeaguePals ObjectId FK)
     - `teamName: team.name` (denormalized)
     - `firstName: bowler.firstName`
     - `lastName: bowler.lastName`
     - `name: bowler.firstName + ' ' + bowler.lastName`
     - `avatarUrl: bowler.avatar || null`
     - `average: bowler.avg` (truncated integer)
     - `averageFloat: bowler.realAvgFloat`
     - `enteringAvg: bowler.enteringAvg`
     - `enteringAvgSeason: prior season year string` (derive as "2024-2025" if seasonYear is "2025-2026")
     - `highGame: bowler.highGame`
     - `highGameHdcp: bowler.highGameHdcp`
     - `highSeries: bowler.highSeries`
     - `highSeriesHdcp: bowler.highSeriesHdcp`
     - `gamesPlayed: bowler.gamesPlayed`
     - `blindWeeksTotal: bowler.blindWeeksTotal`
     - `blindWeeksRow: bowler.blindWeeksRow`
     - `indPointsWon: bowler.indPointsWon`
   - **Intentionally exclude**: `birthDate`, `dexterity`, `isFemale`, `dontIdentify`, `isJunior`, `classification`
   - Call `batchWrite('bowlers', docs)` using LeaguePals ObjectId as document ID

3. **Wire both functions** into the main transform execution flow after `populateLeagueConfig`.

## File Operations

### Edit
- `scripts/transform-data.js` — Add `populateTeams()` and `populateBowlers()` functions

## Dependencies

### Depends On
- `phase-2/sub-task-1` — `db`, `batchWrite()` must exist

### Blocks
- `phase-2/sub-task-5` — Final pipeline assembles all mappers

## Acceptance Criteria

- [ ] `populateTeams()` maps all fields from `standings.json` including `pctWon` parsed to float
- [ ] `populateTeams()` uses LeaguePals `_id` as Firestore document ID
- [ ] `populateBowlers()` reads individual team JSON files from `leaguepals-data/teams/`
- [ ] `populateBowlers()` includes `firstName`, `lastName`, `avatarUrl`, `highGameHdcp`, `highSeriesHdcp`, `gamesPlayed`, `blindWeeksTotal`, `blindWeeksRow`, `indPointsWon`
- [ ] `populateBowlers()` does NOT include `birthDate`, `dexterity`, `isFemale`, `isJunior`, `classification`
- [ ] Both functions use LeaguePals ObjectId strings as Firestore document IDs
- [ ] `enteringAvgSeason` field is populated (e.g., `"2024-2025"` when current season is `"2025-2026"`)

## Commit Convention

`feat(phase-2/task-3): expand teams and bowlers mappings with full LeaguePals stats fields`
