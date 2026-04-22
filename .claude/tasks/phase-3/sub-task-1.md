---
id: "phase-3/sub-task-1"
title: "TypeScript Schema Types"
phase: 3
task: 1
status: pending
depends_on: []
blocks: ["phase-3/sub-task-2"]
branch: "feature/firebase-firestore-migration"
commit_prefix: "refactor(phase-3/task-1)"
estimated_files: 1
---

# Phase 3 / Sub-Task 1: TypeScript Schema Types

## Summary

Replaces all TypeScript interfaces in `src/types/index.ts` with types that match the new Firestore
schema from `firebase-migration-plan.md`. This is a prerequisite for all React hooks and component
work — components cannot be typed correctly until the interfaces reflect the actual data shape.
Field renames (`g1`→`game1`, `team1Score`→`team1ScratchScore`, `image`→`imageUrl`, etc.) and new
fields (leagueConfig, `pinned`, `expiresAt`, `blinded`, `isSubstitute`, etc.) are all introduced here.

## Implementation Plan

1. **Replace `src/types/index.ts`** entirely with the new schema interfaces. Preserve the file —
   do not delete and recreate. Use Edit to replace all content.

2. **New/updated interfaces** (one per Firestore collection):

   ```typescript
   // leagueConfig
   interface LeagueConfig { seasonYear, leagueName, leagueType, weekday, startTime,
     bowlingCenter, sanctionNumber, numTeams, bowlersPerTeam, gamesPerNight, totalWeeks,
     numLanes, handicapPct, handicapBase, blindScorePct, minGamesForAvg, prevSeasonMinGames,
     positionRoundSchedule, dues, lineage, entryFee, leaguePalsId }

   // Team (updated)
   interface Team { leaguePalsId, displayId, seasonYear, name, captainName, captainBowlerId,
     wins, losses, ties, points, pointsWon, pointsLost, pctWon, average, scratchPins,
     totalPins, highGame }

   // Bowler (replaces BowlerStat)
   interface Bowler { leaguePalsId, seasonYear, teamId, teamName, firstName, lastName, name,
     avatarUrl, average, averageFloat, enteringAvg, enteringAvgSeason, highGame, highGameHdcp,
     highSeries, highSeriesHdcp, gamesPlayed, blindWeeksTotal, blindWeeksRow, indPointsWon }

   // BowlerScore (replaces BowlerWeek embedded in BowlerStat)
   interface BowlerScore { id, bowlerId, bowlerName, teamId, teamName, opponentTeamId,
     opponentTeamName, matchupId, seasonYear, week, date, actualBowlDate, lanePair,
     game1, game2, game3, series, preBowled, blinded, isSubstitute, substituteFor }

   // Matchup (updated)
   interface Matchup { id, leaguePalsMatchId, seasonYear, week, date, team1Id, team2Id,
     team1ScratchScore, team2ScratchScore, positionRound, completed }

   // TeamSummary (replaces TeamDetail)
   interface TeamSummary { teamId, teamName, lane, teamAvg, game1Total, game2Total, game3Total,
     scratchSeries, handicapPerGame, handicapSeries, totalSeries, points }

   // MatchupDetail (updated)
   interface MatchupDetail { id, matchupId, seasonYear, week, date, team1: TeamSummary, team2: TeamSummary }

   // ScheduleWeek (updated — remove dataWeek)
   interface ScheduleWeek { week, date, seasonYear, status, positionRound, skipReason, event }

   // SeasonTeam (updated)
   interface SeasonTeam { teamId, name, wins, losses, ties, points }

   // Season (updated)
   interface Season { year, startDate, endDate, championTeamId, championTeamName, teams: SeasonTeam[] }

   // DocumentSource
   interface DocumentSource { type: 'text' | 'pdf', content, fileUrl }

   // LeagueDocument (replaces old Document interface if any)
   interface LeagueDocument { id, title, type, version, seasonYear, effectiveDate, active, source, createdAt, updatedAt }

   // Announcement (updated)
   interface Announcement { id, title, message, date, type, priority, pinned, expiresAt, createdAt, updatedAt }

   // Event (updated)
   interface Event { id, title, date, endDate, allDay, location, type, description, createdAt, updatedAt }

   // CarouselImage (updated)
   interface CarouselImage { id, title, description, imageUrl, alt, order, createdAt, updatedAt }
   ```

3. **Remove deprecated interfaces**: `BowlerStat`, `BowlerWeek`, `TeamDetail`, `BowlerScore` (old version).
   The old `BowlerScore` was embedded in `BowlerStat.weeks` — the new `BowlerScore` is a standalone collection type.

4. **Export all interfaces** as named exports.

## File Operations

### Edit
- `src/types/index.ts` — Full replacement of all interfaces to match new Firestore schema

## Dependencies

### Depends On
- None — this is a Wave 1 task; the schema is fully specified in the migration plan

### Blocks
- `phase-3/sub-task-2` — Hooks are typed against these interfaces

## Acceptance Criteria

- [ ] All 14 Firestore collection interfaces are defined and exported
- [ ] `dataWeek` is NOT present on `ScheduleWeek`
- [ ] `g1`/`g2`/`g3` are NOT present anywhere — `game1`/`game2`/`game3` used throughout
- [ ] `team1Score`/`team2Score` are NOT present — `team1ScratchScore`/`team2ScratchScore` used
- [ ] `image` field NOT present on `CarouselImage` — `imageUrl` used
- [ ] `Announcement` has `pinned: boolean` and `expiresAt: string | null`
- [ ] `BowlerScore` has `blinded: boolean`, `preBowled: boolean`, `isSubstitute: boolean`, `substituteFor: string | null`
- [ ] `Season` has `championTeamId: string | null` and `championTeamName: string | null` (not `champion: string`)
- [ ] `npm run build` passes (components will have type errors fixed in Phase 4 — that is expected and acceptable here)

## Commit Convention

`refactor(phase-3/task-1): replace all TypeScript interfaces with Firestore schema types`
