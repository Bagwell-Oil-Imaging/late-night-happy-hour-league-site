# Requirements: Google Drive Storage — Bylaws

## Branch
`feature/google-drive-storage`

## Overview
Replace Firebase Storage with Google Drive for bylaws PDF storage. Firebase Storage
costs money and is currently only used in one place (`DocumentsAdmin.tsx`). Google
Drive (via the league Google account) is free and already set up with a service
account that has Editor access.

The `googleapis` npm package is already installed. Drive folder structure is already
created. All `DRIVE_FOLDER_*` env vars are set in `.env`.

## Drive Setup (already complete)
- Service account: `firebase-adminsdk-fbsvc@late-nite-happy-hour-db.iam.gserviceaccount.com`
- Root folder: `League Site Assets` (`DRIVE_FOLDER_ROOT`)
- Bylaws folder: `bylaws/` (`DRIVE_FOLDER_BYLAWS`)
- Auth: `service-account.json` (gitignored, already present locally)

## File Naming Convention
Bylaws PDFs use a flat folder with descriptive names:
```
bylaws-{season}-v{n}.pdf
```
Example: `bylaws-2025-2026-v2.pdf`

## What Changes

### 1. Remove Firebase Storage entirely
- Remove `getStorage` import and `storage` export from `src/firebase.ts`
- Remove `VITE_FIREBASE_STORAGE_BUCKET` from `.env` and `.env.example`
- Remove `firebase/storage` from `package.json` dependencies (it's part of the
  firebase package — just stop importing it)
- Remove `storage.rules` — no longer needed

### 2. New server-side Drive upload utility (`scripts/drive-client.cjs`)
Shared helper for all Node.js scripts that need to interact with Drive:
- `uploadFile(localPathOrBuffer, folderId, fileName, mimeType)` — upload and return file ID
- `setPublic(fileId)` — grant `anyone` reader access so frontend can serve it
- `getFileUrl(fileId)` — returns `https://drive.google.com/file/d/{fileId}/view`

### 3. New API route / serverless function for Drive uploads from browser
The admin UI runs in the browser and cannot use `service-account.json` directly
(it's a secret). Uploads from the admin UI must go through a serverless function
that holds the credentials server-side.

Use a Vercel serverless function (`api/upload-to-drive.js`) that:
- Accepts a `multipart/form-data` POST with the PDF file and `folderId`
- Authenticates with the service account
- Uploads to Drive, sets public, returns the file ID
- Protected by Firebase Auth token verification (only admins can call it)

### 4. Admin UI — DocumentsAdmin (`src/pages/admin/DocumentsAdmin.tsx`)
- Replace Firebase Storage upload logic with a `POST /api/upload-to-drive`
  call passing the PDF and the `DRIVE_FOLDER_BYLAWS` folder ID
- Store the returned Drive file ID in Firestore `documents` collection
  (`driveFileId` field, replacing `fileUrl` / `storageRef`)
- Display PDF via `https://drive.google.com/file/d/{fileId}/view`

### 5. Frontend — Bylaws display
- Update any component that renders bylaws PDFs to construct the Drive URL
  from `driveFileId` rather than a Firebase Storage URL
- Add a `driveFileUrl(fileId)` helper to `src/utils/drive.ts`

### 6. Firestore `documents` collection schema change
```
// Before:
fileUrl: string        // Firebase Storage download URL

// After:
driveFileId: string    // Google Drive file ID
```

## Out of Scope (future branches)
- Weekly report PDFs from LeaguePals (needs API investigation)
- Carousel image storage migration (CarouselAdmin never used Storage)
- Season assets / team photos admin panel
- Migrating any existing documents already in Firebase Storage (there are none
  in production — Storage was never used in prod)
