---
id: "phase-1/sub-task-2"
title: "Seed Script (12 Collections)"
phase: 1
task: 2
status: pending
depends_on: ["phase-1/sub-task-1"]
blocks: ["phase-1/sub-task-3"]
branch: "feature/firebase-firestore-migration"
commit_prefix: "feat(phase-1/task-2)"
estimated_files: 2
---

# Phase 1 / Sub-Task 2: Seed Script (12 Collections)

## Summary

Writes `scripts/seed-firestore.js`, which reads all existing `src/data/*.json` files and seeds all
12 Firestore collections using the new schema defined in `firebase-migration-plan.md`. This is a
one-time bootstrap script — it transforms the existing JSON data into the correct Firestore document
structure before the full transform pipeline (Phase 2) is ready. Handles the `bowlerStats.json`
`.data` wrapper inconsistency.

## Implementation Plan

1. **Install `firebase-admin`** as a dev dependency: `npm install --save-dev firebase-admin dotenv`.
   Add `GOOGLE_APPLICATION_CREDENTIALS` to `.env.example` pointing to a local service account JSON.

2. **Create `scripts/seed-firestore.js`** with the following seeding logic:

   - Initialize `firebase-admin` using `applicationDefault()` or a service account file from `.env`
   - Use Firestore batch writes (max 500 docs per batch) for all large collections
   - Seed each of the 12 collections in this order (respecting FK dependencies):
     1. `seasons` — from `src/data/seasons.json` → map `champion` string to `championTeamId: null, championTeamName: champion`
     2. `leagueConfig` — **manually construct** a single document for `"2025-2026"` using hardcoded values from the migration plan (handicapPct: 0.85, bowlersPerTeam: 4, gamesPerNight: 3, etc.) since `league-public.json` raw data is in `leaguepals-data/` not `src/data/`
     3. `scheduleWeeks` — from `src/data/scheduleWeeks.json` → remove `dataWeek` field, doc ID = `date`
     4. `teams` — from `src/data/teams.json` → add `leaguePalsId` field (use existing `id` cast to string as placeholder until Phase 2 sets real ObjectIds), map all fields to schema
     5. `bowlers` — from `src/data/bowlerStats.json` (unwrap `.data` array) → map to bowlers schema with `leaguePalsId: id`, `teamId` as string FK, split `name` into `firstName`/`lastName`
     6. `matchups` — from `src/data/matchups.json` → rename `team1Score`/`team2Score` to `team1ScratchScore`/`team2ScratchScore`, cast team IDs to string
     7. `matchupDetails` — from `src/data/weeklyMatchupDetails.json` → map `TeamDetail` to `TeamSummary`, rename `g1/g2/g3` to `game1/game2/game3`
     8. `bowlerScores` — from each bowler's `weeks` array in `bowlerStats.json` → one doc per bowler×week, rename `g1/g2/g3` to `game1/game2/game3`, set `blinded: false` and `preBowled: false` for all (Phase 2 corrects this)
     9. `announcements` — from `src/data/announcements.json` → add `pinned: false`, `expiresAt: null`, `createdAt`, `updatedAt`
     10. `events` — from `src/data/events.json` → add `endDate: null`, `allDay: false`, `createdAt`, `updatedAt`
     11. `carouselImages` — from `src/data/carouselImages.json` → rename `image` → `imageUrl`, add `createdAt`, `updatedAt`
     12. `documents` — seed empty (no existing documents data), skip

3. **Add `seed` script to `package.json`**: `"seed": "node scripts/seed-firestore.js"`

4. **Document service account setup** in a comment block at the top of the seed script.

## File Operations

### Add
- `scripts/seed-firestore.js` — Full 12-collection seeder reading from `src/data/*.json`

### Edit
- `package.json` — Add `"seed": "node scripts/seed-firestore.js"` to scripts
- `.env.example` — Add `GOOGLE_APPLICATION_CREDENTIALS=./service-account.json` with comment

## Dependencies

### Depends On
- `phase-1/sub-task-1` — Firebase project config must exist; `.env.example` must document CREDENTIALS path

### Blocks
- `phase-1/sub-task-3` — Validation script runs the seeder

## Acceptance Criteria

- [ ] `scripts/seed-firestore.js` exists and has no syntax errors (`node --check scripts/seed-firestore.js`)
- [ ] All 12 collections are addressed in the script (even if some are empty)
- [ ] `bowlerStats.json` `.data` wrapper is unwrapped correctly
- [ ] `team1Score`/`team2Score` renamed to `team1ScratchScore`/`team2ScratchScore` in matchups seeding
- [ ] `g1`/`g2`/`g3` renamed to `game1`/`game2`/`game3` everywhere
- [ ] `dataWeek` field removed from scheduleWeeks documents
- [ ] `npm run build` still passes (no changes to src/)
- [ ] `.env.example` documents `GOOGLE_APPLICATION_CREDENTIALS`

## Commit Convention

`feat(phase-1/task-2): add seed-firestore.js to bootstrap all 12 Firestore collections`
