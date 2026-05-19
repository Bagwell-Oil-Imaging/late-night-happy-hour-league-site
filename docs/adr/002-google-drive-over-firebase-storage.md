# ADR-002: Google Drive Over Firebase Storage

**Status:** Accepted  
**Date:** 2026-04-22

## Context
Bylaws PDFs needed cloud storage. Firebase Storage was the natural first choice given the existing Firebase stack.

## Decision
Use Google Drive (personal account via OAuth2 refresh token) for PDF storage instead of Firebase Storage.

## Rejected Alternatives
- **Firebase Storage** — service accounts have no Drive storage quota and cannot create files in a personal Google Drive. Files uploaded via service account are inaccessible to the account owner in Drive UI. Tested and confirmed broken.
- **Vercel Blob** — viable option but adds another paid service; Google Drive is free and already used by the league admin
- **Store PDFs in repo (git)** — binary files bloat git history; impractical for ongoing additions

## Consequences
- Upload endpoint (`api/upload-to-drive.js`) must use OAuth2 refresh token, not service account
- Credentials: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REFRESH_TOKEN`
- Drive file IDs stored in Firestore as `DocumentSource.driveFileId`
- `src/utils/drive.ts` provides URL helpers (`driveFileUrl`, `driveEmbedUrl`, `driveDownloadUrl`)

## Revisit When
- Google Drive API deprecates the OAuth2 approach used here
- Storage needs exceed free Drive quota
