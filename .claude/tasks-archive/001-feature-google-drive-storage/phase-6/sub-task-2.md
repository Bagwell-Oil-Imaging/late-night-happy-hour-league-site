---
id: "phase-6/sub-task-2"
title: "Composite Firestore Indexes"
phase: 6
task: 2
status: pending
depends_on: ["phase-2/sub-task-5"]
blocks: []
branch: "feature/firebase-firestore-migration"
commit_prefix: "chore(phase-6/task-2)"
estimated_files: 2
---

# Phase 6 / Sub-Task 2: Composite Firestore Indexes

## Summary

Creates `firestore.indexes.json` declaring all composite indexes required by the Firestore queries
used in the React hooks. Without these, multi-field queries will fail in production with a Firestore
error directing the user to create the index. Deploying these indexes proactively via `firebase deploy`
ensures queries work correctly from day one.

## Implementation Plan

1. **Create `firestore.indexes.json`** with composite indexes for each multi-field query used
   in the hooks. Derive from the indexes listed in `firebase-migration-plan.md`:

   ```json
   {
     "indexes": [
       // teams
       { "collectionGroup": "teams", "fields": [{"fieldPath": "seasonYear", "order": "ASCENDING"}, {"fieldPath": "points", "order": "DESCENDING"}] },
       { "collectionGroup": "teams", "fields": [{"fieldPath": "seasonYear", "order": "ASCENDING"}, {"fieldPath": "wins", "order": "DESCENDING"}] },

       // bowlers
       { "collectionGroup": "bowlers", "fields": [{"fieldPath": "seasonYear", "order": "ASCENDING"}, {"fieldPath": "teamId", "order": "ASCENDING"}] },
       { "collectionGroup": "bowlers", "fields": [{"fieldPath": "seasonYear", "order": "ASCENDING"}, {"fieldPath": "average", "order": "DESCENDING"}] },
       { "collectionGroup": "bowlers", "fields": [{"fieldPath": "seasonYear", "order": "ASCENDING"}, {"fieldPath": "highSeries", "order": "DESCENDING"}] },

       // bowlerScores
       { "collectionGroup": "bowlerScores", "fields": [{"fieldPath": "bowlerId", "order": "ASCENDING"}, {"fieldPath": "seasonYear", "order": "ASCENDING"}, {"fieldPath": "week", "order": "ASCENDING"}] },
       { "collectionGroup": "bowlerScores", "fields": [{"fieldPath": "teamId", "order": "ASCENDING"}, {"fieldPath": "seasonYear", "order": "ASCENDING"}, {"fieldPath": "week", "order": "ASCENDING"}] },
       { "collectionGroup": "bowlerScores", "fields": [{"fieldPath": "seasonYear", "order": "ASCENDING"}, {"fieldPath": "blinded", "order": "ASCENDING"}, {"fieldPath": "series", "order": "DESCENDING"}] },
       { "collectionGroup": "bowlerScores", "fields": [{"fieldPath": "seasonYear", "order": "ASCENDING"}, {"fieldPath": "blinded", "order": "ASCENDING"}, {"fieldPath": "game1", "order": "DESCENDING"}] },

       // matchups
       { "collectionGroup": "matchups", "fields": [{"fieldPath": "seasonYear", "order": "ASCENDING"}, {"fieldPath": "week", "order": "ASCENDING"}] },
       { "collectionGroup": "matchups", "fields": [{"fieldPath": "seasonYear", "order": "ASCENDING"}, {"fieldPath": "completed", "order": "ASCENDING"}] },

       // documents
       { "collectionGroup": "documents", "fields": [{"fieldPath": "type", "order": "ASCENDING"}, {"fieldPath": "seasonYear", "order": "ASCENDING"}, {"fieldPath": "active", "order": "ASCENDING"}] },
       { "collectionGroup": "documents", "fields": [{"fieldPath": "type", "order": "ASCENDING"}, {"fieldPath": "effectiveDate", "order": "DESCENDING"}] }
     ],
     "fieldOverrides": []
   }
   ```

2. **Update `firebase.json`** to include the indexes file reference:
   ```json
   "firestore": {
     "rules": "firestore.rules",
     "indexes": "firestore.indexes.json"
   }
   ```

3. **Add `deploy` script to `package.json`**: `"deploy:rules": "firebase deploy --only firestore:rules,firestore:indexes"`

4. **Note in a comment** in `firestore.indexes.json` that single-field indexes are created
   automatically by Firestore; only composite (multi-field) indexes need to be declared here.

## File Operations

### Add
- `firestore.indexes.json` — All composite index definitions for all collections

### Edit
- `firebase.json` — Add `"indexes": "firestore.indexes.json"` to the `firestore` key
- `package.json` — Add `"deploy:rules"` script

## Dependencies

### Depends On
- `phase-2/sub-task-5` — Transform script complete; final query patterns are known and stable

### Blocks
- Nothing

## Acceptance Criteria

- [ ] `firestore.indexes.json` exists with valid JSON
- [ ] All multi-field queries used in `src/hooks/index.ts` have a corresponding composite index
- [ ] `firebase.json` references `firestore.indexes.json`
- [ ] `package.json` has `deploy:rules` script
- [ ] `firebase deploy --only firestore:indexes` (manual step) completes without errors when credentials are available

## Commit Convention

`chore(phase-6/task-2): add composite Firestore indexes for all multi-field collection queries`
