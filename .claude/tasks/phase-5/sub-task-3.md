---
id: "phase-5/sub-task-3"
title: "Documents Admin + PDF Upload + Version Management"
phase: 5
task: 3
status: pending
depends_on: ["phase-5/sub-task-1"]
blocks: []
branch: "feature/firebase-firestore-migration"
commit_prefix: "feat(phase-5/task-3)"
estimated_files: 4
---

# Phase 5 / Sub-Task 3: Documents Admin + PDF Upload + Version Management

## Summary

Builds the `documents` admin panel, which is more complex than the other panels because it manages
versioned content with an active/inactive toggle. Supports two content types: PDF (uploaded to
Firebase Storage and stored as a URL) and text (written as Markdown). Enforces the schema invariant
that only one document per `type + seasonYear` can be `active == true` at a time, enforced via a
Firestore batch that deactivates the previous version when publishing a new one.

## Implementation Plan

1. **Enable Firebase Storage** in `src/firebase.ts`:
   - Add `import { getStorage } from 'firebase/storage'`
   - Export `export const storage = getStorage(app)`

2. **Create `src/pages/admin/DocumentsAdmin.tsx`**:

   **List view** — grouped by `type`:
   - Shows all document versions per type with `version`, `effectiveDate`, `active` badge
   - "Set Active" button: runs a Firestore batch that sets `active: false` on all documents of
     the same `type + seasonYear`, then `active: true` on the selected one
   - "Edit" button: opens form in edit mode
   - "Delete" button with confirmation (cannot delete the active version without first activating another)

   **Create/Edit form**:
   - `title` (text), `type` (select: bylaws/rules/prizefund/handbook/other), `version` (text),
     `seasonYear` (text), `effectiveDate` (date), `active` (checkbox — triggers batch deactivation)
   - **Source type toggle**: "Text" or "PDF"
   - If "Text": show a `<textarea>` for markdown `content`
   - If "PDF": show a file input for PDF upload → upload to Firebase Storage at
     `documents/{type}/{version}/{filename}` → store download URL as `source.fileUrl`
   - On save: set `source.type`, populate `source.content` or `source.fileUrl`, null out the other

3. **Active version enforcement** (Issue 14 fix):
   - When saving a document with `active: true`, use a Firestore batch:
     1. Query all documents with same `type + seasonYear`
     2. Set `active: false` on all
     3. Set `active: true` on the new/edited document
     4. Commit as single atomic batch

4. **Firebase Storage rules** — add Storage rules to `storage.rules` (create file):
   ```
   allow read: if true;
   allow write: if request.auth != null;
   ```
   Update `firebase.json` to declare `"storage": { "rules": "storage.rules" }`.

## File Operations

### Add
- `src/pages/admin/DocumentsAdmin.tsx` — Documents CRUD panel with PDF upload and version management
- `src/pages/admin/DocumentsAdmin.css` — Styles
- `storage.rules` — Firebase Storage security rules

### Edit
- `src/firebase.ts` — Add `getStorage` import and `storage` export
- `firebase.json` — Add `storage.rules` declaration

## Dependencies

### Depends On
- `phase-5/sub-task-1` — `RequireAuth`, `AdminLayout`, and base routes must exist

### Blocks
- Nothing

## Acceptance Criteria

- [ ] `/admin/documents` lists all document versions grouped by type
- [ ] "Set Active" correctly deactivates other versions of same type+season in a single batch
- [ ] Cannot have two `active == true` documents for the same `type + seasonYear`
- [ ] PDF upload stores file in Firebase Storage and saves the download URL in `source.fileUrl`
- [ ] Text documents save markdown content in `source.content`
- [ ] `source.content` is `null` when `source.type == 'pdf'` and vice versa
- [ ] `storage.rules` created with public read, auth-required write
- [ ] `firebase.json` updated to include `storage.rules`
- [ ] `src/firebase.ts` exports `storage`
- [ ] `npm run build` passes

## Commit Convention

`feat(phase-5/task-3): add documents admin with PDF upload and active version enforcement`
