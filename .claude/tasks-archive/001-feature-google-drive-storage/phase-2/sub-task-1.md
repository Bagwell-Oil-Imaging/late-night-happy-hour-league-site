---
id: "phase-2/sub-task-1"
title: "firebase-admin Setup + Batch Write Helper"
phase: 2
task: 1
status: pending
depends_on: ["phase-1/sub-task-1"]
blocks: ["phase-2/sub-task-2", "phase-2/sub-task-3", "phase-2/sub-task-4"]
branch: "feature/firebase-firestore-migration"
commit_prefix: "feat(phase-2/task-1)"
estimated_files: 3
---

# Phase 2 / Sub-Task 1: firebase-admin Setup + Batch Write Helper

## Summary

Installs `firebase-admin` as a production dependency and wires up service account authentication in
`scripts/transform-data.js`. Extracts a reusable `batchWrite(collection, docs)` helper that handles
the 500-document Firestore batch limit automatically. This scaffolding is what all subsequent Phase 2
sub-tasks build on — none of them can write to Firestore until this plumbing exists.

## Implementation Plan

1. **Install `firebase-admin`** as a dependency (not devDependency — the transform script is a
   production data pipeline):
   ```
   npm install firebase-admin
   ```

2. **Add service account env var to `.env.example`**:
   ```
   FIREBASE_SERVICE_ACCOUNT_PATH=./service-account.json
   ```
   Note: `service-account.json` must be in `.gitignore` already — verify this.

3. **Scaffold the top of `scripts/transform-data.js`**:
   - Add `require('dotenv').config()` at the top
   - Initialize `firebase-admin` using `serviceAccount` from `FIREBASE_SERVICE_ACCOUNT_PATH`
   - Export (or scope-close) a `db` reference to the Firestore instance
   - Write a `batchWrite(collectionName, docs)` async function:
     - Splits `docs` array into chunks of 500
     - Uses `db.batch()` for each chunk with `batch.set()` for each doc
     - Logs `[collectionName] Wrote N documents` after each chunk commits
   - Write a `clearCollection(collectionName)` async function for re-run safety:
     - Deletes all documents in the named collection using batched deletes
     - Logs before and after

4. **Update the `update-data` npm script** to chain the transform after the fetch:
   The script already exists as `node scripts/fetch-league-data.js && node scripts/transform-data.js`.
   No change needed — just confirm it still works after adding the firebase-admin init.

## File Operations

### Edit
- `scripts/transform-data.js` — Add dotenv config, firebase-admin init, `batchWrite()` helper, `clearCollection()` helper at the top of the file
- `.env.example` — Add `FIREBASE_SERVICE_ACCOUNT_PATH` with placeholder and comment
- `package.json` — `firebase-admin` added to `dependencies` by npm install

## Dependencies

### Depends On
- `phase-1/sub-task-1` — Firebase project must be configured; `.env.example` must exist

### Blocks
- `phase-2/sub-task-2` — leagueConfig mapping uses `batchWrite()`
- `phase-2/sub-task-3` — teams/bowlers mapping uses `batchWrite()`
- `phase-2/sub-task-4` — bowlerScores mapping uses `batchWrite()`

## Acceptance Criteria

- [ ] `firebase-admin` appears in `package.json` dependencies
- [ ] `scripts/transform-data.js` initializes firebase-admin at the top using env-provided service account path
- [ ] `batchWrite(collectionName, docs)` function exists, handles >500 docs by chunking
- [ ] `clearCollection(collectionName)` function exists for idempotent re-runs
- [ ] `.env.example` documents `FIREBASE_SERVICE_ACCOUNT_PATH`
- [ ] `service-account.json` is in `.gitignore` (verify, add if missing)
- [ ] `npm run build` still passes (no changes to React src/)

## Commit Convention

`feat(phase-2/task-1): wire firebase-admin and batch write helper into transform script`
