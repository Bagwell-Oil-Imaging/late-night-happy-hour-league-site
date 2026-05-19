---
id: "phase-2/sub-task-1"
title: "Update DocumentSource type and add driveFileUrl utility"
phase: 2
task: 1
status: completed
depends_on: []
blocks: ["phase-3/sub-task-1", "phase-4/sub-task-1"]
branch: "feature/google-drive-storage"
commit_prefix: "feat(phase-2/task-1)"
estimated_files: 2
---

# Phase 2 / Sub-Task 1: Update DocumentSource type and add driveFileUrl utility

## Summary

Updates the `DocumentSource` TypeScript interface in `src/types/index.ts` to
replace the Firebase Storage `fileUrl` field with a `driveFileId` field. Also
creates `src/utils/drive.ts` with a `driveFileUrl(fileId)` helper that converts
a Drive file ID to a public-facing URL. Both the admin UI update (phase 3) and
the frontend display update (phase 4) depend on these shared definitions.

## Implementation Plan

1. **Edit `src/types/index.ts`** — In the `DocumentSource` interface, replace:
   ```ts
   /** Firebase Storage URL when type == 'pdf', null otherwise */
   fileUrl: string | null;
   ```
   with:
   ```ts
   /** Google Drive file ID when type == 'pdf', null otherwise */
   driveFileId: string | null;
   ```

2. **Create `src/utils/drive.ts`** — Export two functions:
   - `driveFileUrl(fileId: string): string` — returns
     `https://drive.google.com/file/d/${fileId}/view`
   - `driveDownloadUrl(fileId: string): string` — returns
     `https://drive.google.com/uc?export=download&id=${fileId}`
     (used for the download button in BylawsModal)

3. **Fix TypeScript errors** — After changing the type, the compiler will flag
   any references to `source.fileUrl` in `DocumentsAdmin.tsx` and
   `BylawsModal.tsx`. Leave those as `// TODO: phase-3` and `// TODO: phase-4`
   comments for now — they will be fixed in their respective sub-tasks. The goal
   of this sub-task is only the type and utility, not the consumers.

   Actually: since the TypeScript errors will break `npm run build`, instead
   add a temporary type alias:
   ```ts
   /** @deprecated use driveFileId — remove after phase-3/phase-4 */
   fileUrl?: string | null;
   ```
   keeping both fields temporarily so the build stays green until consumers
   are updated.

## File Operations

### Add
- `src/utils/drive.ts` — Drive URL helper functions

### Edit
- `src/types/index.ts` — Add `driveFileId` to `DocumentSource`; keep deprecated `fileUrl` temporarily

## Dependencies

### Depends On
- *(none — pure type and utility work)*

### Blocks
- `phase-3/sub-task-1` — DocumentsAdmin needs `driveFileId` type and `driveFileUrl` util
- `phase-4/sub-task-1` — BylawsModal needs `driveFileId` type and `driveFileUrl` util

## Acceptance Criteria

- [ ] `src/utils/drive.ts` exports `driveFileUrl` and `driveDownloadUrl`
- [ ] `driveFileUrl('abc')` returns `https://drive.google.com/file/d/abc/view`
- [ ] `driveDownloadUrl('abc')` returns `https://drive.google.com/uc?export=download&id=abc`
- [ ] `DocumentSource` has `driveFileId: string | null` field
- [ ] `npm run build` passes with no new TypeScript errors

## Commit Convention

`feat(phase-2/task-1): add driveFileId type and driveFileUrl utility`
