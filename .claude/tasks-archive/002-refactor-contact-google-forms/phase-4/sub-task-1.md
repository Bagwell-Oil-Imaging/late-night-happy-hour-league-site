---
id: "phase-4/sub-task-1"
title: "Update BylawsModal to serve PDFs from Google Drive"
phase: 4
task: 1
status: pending
depends_on: ["phase-2/sub-task-1"]
blocks: ["phase-5/sub-task-1"]
branch: "feature/google-drive-storage"
commit_prefix: "feat(phase-4/task-1)"
estimated_files: 1
---

# Phase 4 / Sub-Task 1: Update BylawsModal to serve PDFs from Google Drive

## Summary

Updates `src/components/BylawsModal.tsx` to resolve PDF URLs from
`source.driveFileId` using the `driveFileUrl()` and `driveDownloadUrl()` helpers
instead of reading `source.fileUrl` directly. The component's visual structure,
iframe embed, download button, and loading/empty states are unchanged — only
the URL resolution logic swaps out.

## Implementation Plan

1. **Import Drive utilities** — Add:
   ```ts
   import { driveFileUrl, driveDownloadUrl } from '../utils/drive'
   ```

2. **Replace all `source.fileUrl` references** — There are three in the component:

   a. Download button in modal header (line ~71):
   ```tsx
   // OLD
   {doc?.source.type === 'pdf' && doc.source.fileUrl && (
     <a href={doc.source.fileUrl} download ...>Download</a>
   )}
   // NEW
   {doc?.source.type === 'pdf' && doc.source.driveFileId && (
     <a href={driveDownloadUrl(doc.source.driveFileId)} download ...>Download</a>
   )}
   ```

   b. Iframe src (line ~103):
   ```tsx
   // OLD
   {!loading && doc?.source.type === 'pdf' && doc.source.fileUrl && (
     <iframe src={doc.source.fileUrl} ... />
   )}
   // NEW
   {!loading && doc?.source.type === 'pdf' && doc.source.driveFileId && (
     <iframe src={driveFileUrl(doc.source.driveFileId)} ... />
   )}
   ```

   c. Fallback download link (line ~111):
   ```tsx
   // OLD
   <a href={doc.source.fileUrl} download ...>Download PDF</a>
   // NEW
   <a href={driveDownloadUrl(doc.source.driveFileId!)} download ...>Download PDF</a>
   ```

3. **Update JSDoc** — Update the module docstring to replace "pointing at
   `doc.source.fileUrl`" with "pointing at the Drive file URL resolved from
   `doc.source.driveFileId`".

## File Operations

### Edit
- `src/components/BylawsModal.tsx` — Replace `source.fileUrl` with `driveFileId` + helper functions

## Dependencies

### Depends On
- `phase-2/sub-task-1` — `driveFileId` type and `driveFileUrl`/`driveDownloadUrl` utils must exist

### Blocks
- `phase-5/sub-task-1` — Firebase Storage can only be fully removed after all consumers are updated

## Acceptance Criteria

- [ ] No references to `source.fileUrl` remain in `BylawsModal.tsx`
- [ ] Iframe src uses `driveFileUrl(doc.source.driveFileId)`
- [ ] Download buttons use `driveDownloadUrl(doc.source.driveFileId)`
- [ ] Component renders correctly when `driveFileId` is null (no PDF case)
- [ ] `npm run build` passes with no TypeScript errors

## Commit Convention

`feat(phase-4/task-1): update BylawsModal to serve PDFs from Google Drive`
