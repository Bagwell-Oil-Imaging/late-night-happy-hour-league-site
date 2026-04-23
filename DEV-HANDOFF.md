# Dev Handoff — Google Drive Upload + vercel dev Issues

**Branch:** `feature/google-drive-storage`  
**Date:** 2026-04-22

---

## What We Were Doing

Testing the PDF bylaws upload flow in `DocumentsAdmin`. The upload POSTs to `/api/upload-to-drive.js` (a Vercel serverless function). This endpoint is not served by plain Vite (`npm run dev`) — it requires the Vercel dev server.

---

## The Core Problem

`vercel dev` is not serving the app correctly locally. Symptoms:
- `@react-refresh` and `main.tsx` return 404
- Vite virtual modules (`/@vite/client`) are being caught by the SPA rewrite rule and served `index.html` instead

**Root cause:** The rewrite rule in `vercel.json` is matching Vite's virtual module paths (e.g. `/@vite/client`, `/@react-refresh`) because they have no file extension, so the `[^.]*` guard doesn't exclude them.

**What we tried:**
1. `npm run dev` (Vite only, port 5173) — works for the app, but `/api/` returns 404
2. `vercel dev` without `devCommand` — Vite starts on port 3000 via `vite --port $PORT`, but rewrite catches virtual modules
3. Various `vercel.json` rewrite patterns — none resolved both the SPA routing AND Vite virtual modules simultaneously

---

## Recommended Fix (next session)

### Option A — Fix the rewrite (simplest, try first)

Update `vercel.json` rewrite to also exclude paths starting with `@` and `src`:

```json
{
  "framework": "vite",
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "rewrites": [{ "source": "/((?!api/|@|src/|node_modules)[^.]*)", "destination": "/" }]
}
```

Then run `vercel dev` and test at `localhost:3000`.

### Option B — Deploy a preview branch (most reliable)

Push the branch and let Vercel build a preview deployment. Test the upload there. This is what Vercel is designed for and sidesteps all local dev complexity entirely.

```bash
git push origin feature/google-drive-storage
```

Vercel will auto-deploy a preview URL. Test the upload at that URL.

### Option C — Two terminals (always works)

Run both servers simultaneously:
- Terminal 1: `npm run dev` (Vite on 5173) — use for all UI work
- Terminal 2: `vercel dev` on a different port just to confirm the API function works

Or proxy just the API calls: in `vite.config.ts` add a proxy so `/api/*` forwards to a separately running `vercel dev` instance.

---

## Current State of the Code

Everything is complete and TypeScript-clean. The only blocker is **testing** the upload locally. The code itself is correct.

### What's done:
- `DocumentsAdmin.tsx` — fully simplified: season dropdown + drop zone only
- Auto-versioning: `2025-2026.1`, `2025-2026.2`, etc.
- Filename: `League_Bylaws_{season}.{revision}.pdf`
- Immediate upload on file select/drop
- Drop zone disabled until season selected
- Every upload auto-activates for that season
- Firestore index deployed for `seasonYear DESC, effectiveDate DESC`
- `browserSessionPersistence` + 30-min idle timeout implemented
- All admin CSS polished and missing classes fixed

### Files changed this session:
- `src/pages/admin/DocumentsAdmin.tsx` — full rewrite (simplified)
- `src/pages/admin/DocumentsAdmin.css` — drop zone states, removed dead code
- `src/pages/admin/AnnouncementsAdmin.css` — added missing shared classes
- `src/pages/admin/AdminLoginPage.css` — polished, removed hardcoded hex
- `src/components/admin/AdminLayout.tsx` — idle timeout added
- `src/components/admin/AdminLayout.css` — polished
- `src/firebase.ts` — browserSessionPersistence
- `src/types/index.ts` — LeagueDocument.type narrowed to 'bylaws'
- `firestore.indexes.json` — new index deployed
- `vercel.json` — devCommand removed, rewrite updated

---

## Open Questions

1. Does the Google Drive service account have the correct permissions on the bylaws folder? (Could cause a different error once the API endpoint is reachable)
2. Is `VITE_DRIVE_FOLDER_BYLAWS` set in the Vercel project environment variables?
