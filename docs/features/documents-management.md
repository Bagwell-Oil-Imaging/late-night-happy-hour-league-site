---
feature: Documents Management
number: 16
source-paths:
  - src/pages/admin/DocumentsAdmin.tsx
  - api/upload-to-drive.js
diagram: ../diagrams/features/documents-management.md
status: no diagram
---

## Intent
Allows admins to upload new PDF bylaws documents, store them in Google Drive, and track which version is currently active on the public site.

## Key Behaviors
- Upload PDF file from admin panel via drag-and-drop or file picker
- Season must be selected before upload is enabled; version is auto-incremented ({seasonYear}.{revision})
- File sent to /api/upload-to-drive immediately on selection (before the Save button is clicked)
- /api/upload-to-drive verifies the caller's Firebase ID token, uploads to Drive, sets the file public, and returns { fileId }
- After Drive upload succeeds, admin clicks Save to write the Firestore document record with the Drive file ID
- New upload automatically becomes the active version via a Firestore batch write that deactivates all other docs for the same season
- Existing document's season can be edited inline from the list table; version recalculates and auto-activate runs

## Conditional Paths
- If OAuth2 token is invalid/expired, upload fails with auth error — admin must refresh credentials in Vercel env vars
- If VITE_DRIVE_FOLDER_BYLAWS env var is not set, the folderId sent to the API will be undefined
- Only one document per type+season can be active at a time (enforced via Firestore batch)
- If Drive upload succeeds but Firestore write fails, an orphaned Drive file may exist
- If setPublic fails after a successful upload, the API returns HTTP 207 with a warning; the file ID is still returned and the admin can manually share the file in Drive

## External Dependencies
- Firestore: documents (CRUD, active flag management via writeBatch)
- Firestore: seasons (read — useSeasons hook populates the season dropdown)
- Google Drive API via OAuth2 (upload + setPublic permission)
- Vercel serverless /api/upload-to-drive
- Firebase Auth (route guard; ID token sent as Authorization: Bearer header to the API)
- src/utils/drive.ts — driveFileUrl used to render PDF links in the table
- Google OAuth2 env vars (GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, GOOGLE_OAUTH_REFRESH_TOKEN)
- GOOGLE_SERVICE_ACCOUNT_JSON env var (server-side Firebase Admin SDK for ID token verification)
- VITE_DRIVE_FOLDER_BYLAWS env var (Drive folder ID, client-side, sent to the API as folderId)

## Known Issues
None

## Notes
OAuth2 credentials must be server-side only — ADR-003 explains why. Drive file IDs stored in Firestore; actual files in Google Drive. driveFileUrl/driveEmbedUrl/driveDownloadUrl utilities in src/utils/drive.ts construct URLs from file IDs.
