---
id: "phase-3/sub-task-1"
title: "Update DocumentsAdmin to upload PDFs via Google Drive"
phase: 3
task: 1
status: completed
depends_on: ["phase-1/sub-task-2", "phase-2/sub-task-1"]
blocks: ["phase-5/sub-task-1"]
branch: "feature/google-drive-storage"
commit_prefix: "feat(phase-3/task-1)"
estimated_files: 1
---

# Phase 3 / Sub-Task 1: Update DocumentsAdmin to upload PDFs via Google Drive

## Summary

Replaces Firebase Storage upload logic in `src/pages/admin/DocumentsAdmin.tsx`
with a `POST /api/upload-to-drive` call. On successful upload the component
stores the returned `driveFileId` in Firestore instead of a Storage URL. The
admin's existing form flow (file picker, progress indicator, active version
enforcement) remains unchanged — only the upload mechanism and stored field
swap out.

## Implementation Plan

1. **Remove Firebase Storage imports** — Delete:
   ```ts
   import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
   import { db, storage } from '../../firebase'
   ```
   Replace with:
   ```ts
   import { db } from '../../firebase'
   import { driveFileUrl } from '../../utils/drive'
   ```

2. **Update `DocumentForm` interface** — Replace `existingPdfUrl: string` with
   `existingDriveFileId: string` to track the current Drive file ID when editing.

3. **Update `docToForm`** — Map `d.source.driveFileId ?? ''` into
   `existingDriveFileId`.

4. **Update `handleSave`** — Replace the Storage upload block:
   ```ts
   // OLD
   const storageRef = ref(storage, `documents/${form.type}/${form.pdfFile.name}`)
   await uploadBytes(storageRef, form.pdfFile)
   fileUrl = await getDownloadURL(storageRef)

   // NEW
   setUploadProgress('Uploading to Google Drive…')
   const token = await auth.currentUser!.getIdToken()
   const formData = new FormData()
   formData.append('file', form.pdfFile)
   formData.append('folderId', import.meta.env.VITE_DRIVE_FOLDER_BYLAWS)
   formData.append('fileName', `bylaws-${form.seasonYear}-${form.version}.pdf`)
   const res = await fetch('/api/upload-to-drive', {
     method: 'POST',
     headers: { Authorization: `Bearer ${token}` },
     body: formData,
   })
   if (!res.ok) throw new Error('Drive upload failed')
   const { fileId } = await res.json()
   driveFileId = fileId
   ```
   Note: import `auth` from `../../firebase`.

5. **Update `source` object construction** — Replace `fileUrl` with `driveFileId`:
   ```ts
   const source = {
     type: form.sourceType,
     content: form.sourceType === 'text' ? (form.content || null) : null,
     driveFileId: form.sourceType === 'pdf' ? driveFileId : null,
   }
   ```

6. **Update the "Current file" link in the form** — When editing a pdf doc,
   show the existing file link using `driveFileUrl(form.existingDriveFileId)`:
   ```tsx
   {form.existingDriveFileId && !form.pdfFile && (
     <p>Current file: <a href={driveFileUrl(form.existingDriveFileId)} target="_blank">View PDF</a></p>
   )}
   ```

7. **Update the PDF link in the table rows** — Change:
   ```tsx
   <a href={d.source.fileUrl ?? '#'} ...>PDF</a>
   ```
   to:
   ```tsx
   <a href={d.source.driveFileId ? driveFileUrl(d.source.driveFileId) : '#'} ...>PDF</a>
   ```

8. **Add `VITE_DRIVE_FOLDER_BYLAWS` to `.env.example`** — Document it as the
   Drive folder ID for bylaws uploads from the admin UI.

## File Operations

### Edit
- `src/pages/admin/DocumentsAdmin.tsx` — Replace Storage upload with Drive API call; update form state and Firestore writes
- `.env.example` — Add `VITE_DRIVE_FOLDER_BYLAWS`

## Dependencies

### Depends On
- `phase-1/sub-task-2` — The `/api/upload-to-drive` endpoint must exist
- `phase-2/sub-task-1` — `driveFileId` type and `driveFileUrl` util must exist

### Blocks
- `phase-5/sub-task-1` — Firebase Storage can only be removed after this component no longer uses it

## Acceptance Criteria

- [ ] No `firebase/storage` imports remain in `DocumentsAdmin.tsx`
- [ ] PDF upload calls `POST /api/upload-to-drive` with a Bearer token
- [ ] Firestore `source.driveFileId` is written on successful upload
- [ ] Existing PDF file link uses `driveFileUrl()` in both form and table
- [ ] `VITE_DRIVE_FOLDER_BYLAWS` is in `.env.example`
- [ ] `npm run build` passes with no TypeScript errors

## Commit Convention

`feat(phase-3/task-1): replace Firebase Storage upload with Google Drive in DocumentsAdmin`
