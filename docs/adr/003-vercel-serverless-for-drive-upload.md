# ADR-003: Vercel Serverless Function for Drive Upload

**Status:** Accepted  
**Date:** 2026-04-22

## Context
Uploading to Google Drive via OAuth2 requires a client secret and refresh token. These cannot be exposed in browser-side code.

## Decision
Use a Vercel serverless function (`api/upload-to-drive.js`) as the upload endpoint. The browser POSTs the file to `/api/upload-to-drive`; the function holds the credentials server-side and proxies to Drive.

## Rejected Alternatives
- **Upload directly from browser** — exposes OAuth2 client secret; not acceptable
- **Separate Express server** — additional infrastructure, additional deployment, additional cost; Vercel already hosts the site
- **Firebase Cloud Functions** — would work but adds Firebase billing complexity; Vercel Functions are included in the existing deployment

## Consequences
- `api/upload-to-drive.js` requires `vercel dev` to test locally — plain `npm run dev` (Vite only) does not serve the `api/` directory
- Environment variables `GOOGLE_OAUTH_*` must be set in Vercel project settings (not just `.env.local`)
- `formidable` v3 must be destructured: `const { formidable } = require('formidable')` — not default export

## Revisit When
- Moving to a different hosting platform
- Google Drive is replaced as storage backend (see ADR-002)
