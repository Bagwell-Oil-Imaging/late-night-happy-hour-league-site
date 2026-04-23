---
id: "phase-1/sub-task-3"
title: "Run Seed + Validation Script"
phase: 1
task: 3
status: pending
depends_on: ["phase-1/sub-task-2"]
blocks: []
branch: "feature/firebase-firestore-migration"
commit_prefix: "chore(phase-1/task-3)"
estimated_files: 1
---

# Phase 1 / Sub-Task 3: Run Seed + Validation Script

## Summary

Executes the seed script against the real Firestore project and writes a lightweight
`scripts/verify-seed.js` that queries each collection for document counts and logs a pass/fail
summary. This confirms the seeder populated all 12 collections with expected document volumes
before Phase 2 or Phase 3 begin writing code that depends on the data shape.

## Implementation Plan

1. **Run the seed script** (requires a local `.env` with real credentials):
   ```
   npm run seed
   ```
   Confirm it completes without errors. If it fails, debug the seed script before proceeding.

2. **Write `scripts/verify-seed.js`** that:
   - Connects to Firestore using the same admin SDK setup
   - Queries each of the 12 collections with `collection.count()` (Firestore Admin SDK)
   - Prints a table:
     ```
     leagueConfig   expected: 1    actual: 1    ✅
     teams          expected: 13   actual: 13   ✅
     bowlers        expected: ~58  actual: XX   ✅/❌
     ...
     ```
   - Exits with code 1 if any collection has 0 documents when > 0 are expected
   - Expected counts are hardcoded constants derived from the migration plan estimates

3. **Add `verify-seed` script to `package.json`**: `"verify-seed": "node scripts/verify-seed.js"`

4. **Run the verification** and confirm all counts are within expected ranges.

## File Operations

### Add
- `scripts/verify-seed.js` — Queries all 12 collections and reports document counts with pass/fail

### Edit
- `package.json` — Add `"verify-seed": "node scripts/verify-seed.js"` to scripts

## Dependencies

### Depends On
- `phase-1/sub-task-2` — Seed script must exist and be runnable

### Blocks
- Nothing directly, but all subsequent phases that read from Firestore benefit from verified data

## Acceptance Criteria

- [ ] `npm run seed` completes without JavaScript errors (requires real credentials in `.env`)
- [ ] `scripts/verify-seed.js` exists and queries all 12 collections
- [ ] `npm run verify-seed` prints a pass/fail table and exits 0 when all collections have data
- [ ] `leagueConfig` has exactly 1 document
- [ ] `teams` has documents (count > 0)
- [ ] `bowlers` has documents (count > 0)
- [ ] `bowlerScores` has documents (count > 0)
- [ ] `matchups` has documents (count > 0)
- [ ] `matchupDetails` has documents (count > 0)
- [ ] `scheduleWeeks` has documents (count > 0)

## Commit Convention

`chore(phase-1/task-3): add verify-seed script and confirm 12-collection Firestore seed`
