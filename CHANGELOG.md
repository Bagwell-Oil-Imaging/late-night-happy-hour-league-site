# Changelog

All notable changes to the Late Night Happy Hour Bowling League site are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased]

### Added
- `src/utils/drive.ts` — `driveFileUrl(fileId)` and `driveDownloadUrl(fileId)` helpers that convert a Google Drive file ID to a viewer or download URL
- `DocumentSource.driveFileId: string | null` field — replaces Firebase Storage URL with a Drive file ID for PDF documents

### Deprecated
- `DocumentSource.fileUrl` — superseded by `driveFileId`; will be removed after phase-3 and phase-4 consumers are updated

---

- High Individual Game and High Individual Series highlight cards on the Home Page (top 3 bowlers per category for the latest completed week)
- `useBowlerScoresByWeek` hook in `src/hooks/index.ts` — fetches non-blinded `BowlerScore` documents for a specific week; uses sentinel pattern to avoid over-fetching when the week is not yet resolved
- Composite Firestore index: `bowlerScores` on `seasonYear ASC, week ASC, blinded ASC` (required by the new hook)
- `.highlight-team-sub` CSS class for muted team name subtitle in individual highlight card entries
- Firebase Firestore integration replacing all static JSON data files
- 12 Firestore collections: leagueConfig, teams, bowlers, bowlerScores, matchups, matchupDetails, scheduleWeeks, seasons, documents, announcements, events, carouselImages
- Generic `useCollection<T>` and `useDocument<T>` React hooks with real-time `onSnapshot` listeners
- 16 domain-specific Firestore hooks for all collections
- Admin CRUD UI at `/admin` with Firebase Auth guard
- Admin panels for announcements (pinned, expiresAt), events (endDate, allDay), carousel images, and documents (PDF upload, version management)
- Firebase Storage integration for PDF document uploads
- `scripts/seed-firestore.js` — one-time seeder from legacy JSON files
- `scripts/verify-seed.js` — Firestore collection count validator
- Composite Firestore indexes for all multi-field queries
- Security rules for Firestore and Firebase Storage

### Changed
- `scripts/transform-data.js` — now writes directly to Firestore via firebase-admin batch writes
- All React components migrated from static JSON imports to live Firestore hooks
- TypeScript interfaces updated to match new Firestore schema (corrected 21 schema issues)
- `team1Score`/`team2Score` renamed to `team1ScratchScore`/`team2ScratchScore`
- `g1`/`g2`/`g3` game fields renamed to `game1`/`game2`/`game3` throughout
- Absent bowler game scores stored as `null` (not `0`) to prevent aggregate corruption
- Blind game detection now uses LeaguePals `"-"` marker instead of average comparison

### Removed
- All `src/data/*.json` static data files
- `BowlerStat`, `BowlerWeek`, `TeamDetail` TypeScript interfaces (replaced by Firestore types)
- `dataWeek` field from schedule weeks (array-index artifact with no Firestore equivalent)
