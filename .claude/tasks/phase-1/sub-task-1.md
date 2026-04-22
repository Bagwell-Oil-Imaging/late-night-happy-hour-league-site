---
id: "phase-1/sub-task-1"
title: "Security Rules + Firebase Config"
phase: 1
task: 1
status: pending
depends_on: []
blocks: ["phase-1/sub-task-2", "phase-2/sub-task-1", "phase-3/sub-task-2", "phase-5/sub-task-1"]
branch: "feature/firebase-firestore-migration"
commit_prefix: "chore(phase-1/task-1)"
estimated_files: 3
---

# Phase 1 / Sub-Task 1: Security Rules + Firebase Config

## Summary

Publishes Firestore security rules that allow public reads and auth-gated writes. Also ensures
`firebase.json` is configured to deploy rules and that the local `.env.example` documents all
required Firebase environment variables. This is the foundation task that unblocks all other
phases — nothing can write to or read from Firestore until the project config is in place.

## Implementation Plan

1. **Create `firestore.rules`** in the project root with the security rules from the migration
   plan: public reads allowed, writes require `request.auth != null`. Use `rules_version = '2'`.

2. **Create or update `firebase.json`** to declare the Firestore rules file path so `firebase deploy`
   will apply the rules. Include a `firestore` key with `"rules": "firestore.rules"`.

3. **Verify `.env.example`** contains all Firebase SDK keys needed by `src/firebase.ts`:
   - `VITE_FIREBASE_API_KEY`
   - `VITE_FIREBASE_AUTH_DOMAIN`
   - `VITE_FIREBASE_PROJECT_ID`
   - `VITE_FIREBASE_STORAGE_BUCKET`
   - `VITE_FIREBASE_MESSAGING_SENDER_ID`
   - `VITE_FIREBASE_APP_ID`
   Add placeholder values and comments for each if missing.

4. **Update `src/firebase.ts`** — verify it exports `db` (Firestore) and `auth` (FirebaseAuth).
   It already does this, but confirm storage export is not needed yet (Firebase Storage comes in Phase 5).

## File Operations

### Add
- `firestore.rules` — Firestore security rules (public read, auth-required write)
- `firebase.json` — Firebase project deployment config pointing to `firestore.rules`

### Edit
- `.env.example` — Ensure all 6 Firestore + Auth env vars are documented with placeholders

## Dependencies

### Depends On
- None — this is a Wave 1 task

### Blocks
- `phase-1/sub-task-2` — Seed script needs Firebase config to exist
- `phase-2/sub-task-1` — firebase-admin setup references same project
- `phase-3/sub-task-2` — Firestore hooks need `src/firebase.ts` confirmed
- `phase-5/sub-task-1` — Auth login needs Firebase Auth configured

## Acceptance Criteria

- [ ] `firestore.rules` exists at project root with `rules_version = '2'` and correct allow rules
- [ ] `firebase.json` exists with `firestore.rules` path declared
- [ ] `.env.example` contains all 6 `VITE_FIREBASE_*` variables with descriptive placeholder values
- [ ] `src/firebase.ts` exports both `db` and `auth` (verify, no changes expected)
- [ ] `npm run build` passes with no new TypeScript errors

## Commit Convention

`chore(phase-1/task-1): publish Firestore security rules and firebase project config`
