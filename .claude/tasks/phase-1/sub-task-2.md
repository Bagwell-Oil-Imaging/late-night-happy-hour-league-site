---
id: "phase-1/sub-task-2"
title: "Create Vercel serverless upload endpoint (api/upload-to-drive.js)"
phase: 1
task: 2
status: pending
depends_on: ["phase-1/sub-task-1"]
blocks: ["phase-3/sub-task-1"]
branch: "feature/google-drive-storage"
commit_prefix: "feat(phase-1/task-2)"
estimated_files: 2
---

# Phase 1 / Sub-Task 2: Create Vercel serverless upload endpoint

## Summary

Creates a Vercel serverless function at `api/upload-to-drive.js` that accepts
multipart PDF uploads from the browser admin UI, verifies the caller is an
authenticated Firebase admin, uploads the file to Google Drive, sets it public,
and returns the Drive file ID. This is necessary because the service account
credentials cannot be exposed to the browser — they must live in Vercel
environment variables server-side. Also updates `vercel.json` so the SPA
catch-all rewrite does not swallow `/api/*` routes.

## Implementation Plan

1. **Update `vercel.json`** — Change the catch-all rewrite to exclude `/api/`
   paths so Vercel routes them to serverless functions:
   ```json
   {
     "rewrites": [{ "source": "/((?!api/).*)", "destination": "/" }]
   }
   ```

2. **Create `api/upload-to-drive.js`** — Vercel serverless function:
   - Parse `multipart/form-data` using the `formidable` package (install it)
   - Extract fields: `folderId` (string), `fileName` (string); and the uploaded file
   - Verify Firebase Auth ID token from `Authorization: Bearer <token>` header
     using the Firebase Admin SDK initialized with credentials from
     `process.env.GOOGLE_SERVICE_ACCOUNT_JSON` (full JSON string) — NOT a file path
   - Upload the file buffer to Drive using `googleapis` with credentials parsed
     from `process.env.GOOGLE_SERVICE_ACCOUNT_JSON`
   - Call `setPublic` on the new file ID
   - Return `{ fileId }` as JSON with status 200
   - Return `{ error }` with appropriate 4xx/5xx on failure

3. **Install `formidable`** — `npm install formidable` (for multipart parsing in
   the serverless context; Vercel does not parse bodies automatically)

4. **Add env var docs** — Add `GOOGLE_SERVICE_ACCOUNT_JSON` to `.env.example`
   with instructions to paste the full contents of `service-account.json`

5. **Auth verification** — Use `firebase-admin`'s `auth().verifyIdToken(token)`.
   Initialize firebase-admin from `GOOGLE_SERVICE_ACCOUNT_JSON` env var, not
   a file path (file paths don't exist in Vercel's serverless environment).

## File Operations

### Add
- `api/upload-to-drive.js` — Vercel serverless function for Drive uploads

### Edit
- `vercel.json` — Exclude `/api/*` from SPA catch-all rewrite
- `.env.example` — Document `GOOGLE_SERVICE_ACCOUNT_JSON` env var

## Dependencies

### Depends On
- `phase-1/sub-task-1` — Mirrors drive-client.cjs logic using env-var credentials

### Blocks
- `phase-3/sub-task-1` — DocumentsAdmin calls this endpoint to upload PDFs

## Acceptance Criteria

- [ ] `api/upload-to-drive.js` exists and exports a default handler function
- [ ] `vercel.json` rewrite excludes `/api/` prefix
- [ ] `formidable` is in `package.json` dependencies
- [ ] `GOOGLE_SERVICE_ACCOUNT_JSON` is documented in `.env.example`
- [ ] Function returns 401 when Authorization header is missing or invalid
- [ ] Function returns `{ fileId: "..." }` on successful upload

## Commit Convention

`feat(phase-1/task-2): add Vercel serverless Drive upload endpoint`
