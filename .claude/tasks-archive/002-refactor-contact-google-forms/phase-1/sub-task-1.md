---
id: "phase-1/sub-task-1"
title: "Create server-side Drive upload helper (drive-client.cjs)"
phase: 1
task: 1
status: pending
depends_on: []
blocks: ["phase-1/sub-task-2"]
branch: "feature/google-drive-storage"
commit_prefix: "feat(phase-1/task-1)"
estimated_files: 1
---

# Phase 1 / Sub-Task 1: Create server-side Drive upload helper

## Summary

Creates `scripts/drive-client.cjs`, a reusable CommonJS module used by all
Node.js pipeline scripts (not the browser) to interact with Google Drive. It
authenticates via `service-account.json` and exposes three functions: upload a
file, make it publicly readable, and resolve a Drive file URL. This module is the
foundation that the Vercel serverless function in sub-task 2 will mirror for
browser-side uploads.

## Implementation Plan

1. **Create `scripts/drive-client.cjs`** — Export three functions:
   - `uploadFile(bufferOrPath, folderId, fileName, mimeType)` — uploads a Buffer
     or local file path to the given Drive folder; returns the new file's ID
   - `setPublic(fileId)` — creates an `anyone` + `reader` permission on the file
     so it can be served publicly without auth
   - `driveFileUrl(fileId)` — returns `https://drive.google.com/file/d/{fileId}/view`

2. **Auth** — Use `google.auth.GoogleAuth` with `keyFile: path.resolve(__dirname, '..', 'service-account.json')` and scope `https://www.googleapis.com/auth/drive`.

3. **uploadFile detail** — Accept either a `Buffer` (for pipeline use with downloaded
   PDFs) or a local file path string. If a path is given, read it with `fs.readFileSync`.
   Use `drive.files.create` with `media.body` set to a `Readable` stream from the buffer.
   Set `fields: 'id'` to return only the file ID.

4. **Error handling** — Let errors propagate naturally (caller handles them). No
   silent swallowing.

## File Operations

### Add
- `scripts/drive-client.cjs` — Shared Drive API helper for all Node.js scripts

## Dependencies

### Depends On
- *(none)*

### Blocks
- `phase-1/sub-task-2` — The Vercel function mirrors this module's logic using env-var credentials

## Acceptance Criteria

- [ ] `require('./scripts/drive-client.cjs')` resolves without error
- [ ] `uploadFile` accepts a Buffer and returns a Drive file ID string
- [ ] `setPublic` sets `anyone`/`reader` permission without error
- [ ] `driveFileUrl('abc123')` returns `https://drive.google.com/file/d/abc123/view`
- [ ] Module is CommonJS (`.cjs`) — no ESM syntax

## Commit Convention

`feat(phase-1/task-1): add server-side Drive upload helper`
