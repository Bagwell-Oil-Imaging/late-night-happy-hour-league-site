---
id: "phase-5/sub-task-1"
title: "Remove Firebase Storage entirely"
phase: 5
task: 1
status: pending
depends_on: ["phase-3/sub-task-1", "phase-4/sub-task-1"]
blocks: []
branch: "feature/google-drive-storage"
commit_prefix: "chore(phase-5/task-1)"
estimated_files: 4
---

# Phase 5 / Sub-Task 1: Remove Firebase Storage entirely

## Summary

Removes all Firebase Storage code and configuration now that both consumers
(DocumentsAdmin and BylawsModal) have been migrated to Google Drive. This
eliminates the billing surface: Firebase Storage charges for storage and
egress. Also removes the deprecated `fileUrl` field added temporarily in
phase 2, and cleans up the stale `storage.rules` file.

## Implementation Plan

1. **Edit `src/firebase.ts`** — Remove:
   ```ts
   import { getStorage } from "firebase/storage";
   // ...
   storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
   // ...
   export const storage = getStorage(app);
   ```

2. **Edit `src/types/index.ts`** — Remove the deprecated `fileUrl` field from
   `DocumentSource` that was kept temporarily in phase 2. Final shape:
   ```ts
   export interface DocumentSource {
     type: 'text' | 'pdf';
     content: string | null;
     driveFileId: string | null;
   }
   ```

3. **Delete `storage.rules`** — No longer needed. Firebase Storage rules are
   only evaluated when Firebase Storage is in use.

4. **Edit `.env.example`** — Remove `VITE_FIREBASE_STORAGE_BUCKET`. Add a
   comment noting Firebase Storage is not used (replaced by Google Drive).

5. **Edit `firebase.json`** — Remove the `"storage"` key from the Firebase
   project config if present, so `firebase deploy` no longer tries to deploy
   storage rules.

6. **Verify build** — Run `npm run build` and confirm zero TypeScript errors
   and no remaining references to `firebase/storage` or `storage` exports.

## File Operations

### Edit
- `src/firebase.ts` — Remove `getStorage` import, `storageBucket` config, and `storage` export
- `src/types/index.ts` — Remove deprecated `fileUrl` field from `DocumentSource`
- `.env.example` — Remove `VITE_FIREBASE_STORAGE_BUCKET`
- `firebase.json` — Remove `storage` deploy target if present

### Delete
- `storage.rules` — Firebase Storage rules file, no longer needed

## Dependencies

### Depends On
- `phase-3/sub-task-1` — DocumentsAdmin must be off Storage before we remove it
- `phase-4/sub-task-1` — BylawsModal must be off Storage before we remove it

### Blocks
- *(none — this is the final cleanup task)*

## Acceptance Criteria

- [ ] `src/firebase.ts` has no `storage` export and no `firebase/storage` import
- [ ] `src/types/index.ts` `DocumentSource` has no `fileUrl` field
- [ ] `storage.rules` file is deleted
- [ ] `VITE_FIREBASE_STORAGE_BUCKET` is removed from `.env.example`
- [ ] `grep -r "firebase/storage" src/` returns no matches
- [ ] `npm run build` passes with zero TypeScript errors

## Commit Convention

`chore(phase-5/task-1): remove Firebase Storage — replaced by Google Drive`
