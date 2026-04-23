---
id: "phase-6/sub-task-1"
title: "Delete JSON Files + Fix TypeScript Errors"
phase: 6
task: 1
status: pending
depends_on: ["phase-4/sub-task-1", "phase-4/sub-task-2", "phase-4/sub-task-3", "phase-4/sub-task-4"]
blocks: []
branch: "feature/firebase-firestore-migration"
commit_prefix: "chore(phase-6/task-1)"
estimated_files: 10
---

# Phase 6 / Sub-Task 1: Delete JSON Files + Fix TypeScript Errors

## Summary

Removes all static JSON data files from `src/data/` now that every component reads from Firestore.
Resolves any remaining TypeScript errors caused by the type changes in Phase 3 or the component
migrations in Phase 4. Updates `CLAUDE.md` and `README.md` to remove references to the JSON files
and document the new Firestore data flow.

## Implementation Plan

1. **Delete all files in `src/data/`**:
   - `src/data/teams.json`
   - `src/data/bowlerStats.json`
   - `src/data/matchups.json`
   - `src/data/weeklyMatchupDetails.json`
   - `src/data/scheduleWeeks.json`
   - `src/data/seasons.json`
   - `src/data/announcements.json`
   - `src/data/events.json`
   - `src/data/carouselImages.json`
   - `src/data/historicalMatches.json` (if unused)

2. **Run `npm run build`** and resolve any TypeScript errors. Common sources:
   - Components still referencing old field names (`g1`, `team1Score`, `dataWeek`, `champion`)
   - Components not yet updated in earlier phases (catch any missed files)
   - Implicit `any` types from Firestore data that need explicit casting

3. **Run `npm run lint`** and fix any ESLint warnings/errors introduced during migration.

4. **Update `CLAUDE.md`** (project-level, create if not present):
   - Remove the `src/data/*.json` files from the Project Structure tree
   - Add `src/hooks/` directory to the Project Structure tree
   - Add `src/pages/admin/` directory
   - Document the Firestore data flow in an Architecture section
   - Note the `firebase-admin` service account requirement for `npm run update-data`

5. **Update `README.md`**:
   - Remove references to static JSON files
   - Add Firestore setup instructions (Firebase project, `.env` configuration)
   - Update `npm run update-data` description

## File Operations

### Delete
- `src/data/teams.json`
- `src/data/bowlerStats.json`
- `src/data/matchups.json`
- `src/data/weeklyMatchupDetails.json`
- `src/data/scheduleWeeks.json`
- `src/data/seasons.json`
- `src/data/announcements.json`
- `src/data/events.json`
- `src/data/carouselImages.json`
- `src/data/historicalMatches.json`

### Edit
- `CLAUDE.md` — Update Project Structure, add Firestore architecture notes
- `README.md` — Update setup instructions and project structure

## Dependencies

### Depends On
- `phase-4/sub-task-1` — Standings/teams/matchups components migrated
- `phase-4/sub-task-2` — Scores/schedule/seasons components migrated
- `phase-4/sub-task-3` — Bowler components migrated
- `phase-4/sub-task-4` — Admin display/home/bylaws components migrated

### Blocks
- Nothing

## Acceptance Criteria

- [ ] `src/data/` directory is empty (or deleted entirely)
- [ ] `npm run build` exits with 0 errors and 0 TypeScript errors
- [ ] `npm run lint` exits with 0 warnings
- [ ] No `import ... from '../data/` anywhere in `src/`
- [ ] `CLAUDE.md` Project Structure tree matches actual repo (includes `src/hooks/`, `src/pages/admin/`)
- [ ] `README.md` has Firestore setup section with `.env` variable instructions

## Commit Convention

`chore(phase-6/task-1): remove all static JSON files and resolve TypeScript errors post-migration`
