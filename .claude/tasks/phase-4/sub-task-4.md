---
id: "phase-4/sub-task-4"
title: "Admin Display + Home + Bylaws Components"
phase: 4
task: 4
status: pending
depends_on: ["phase-3/sub-task-2"]
blocks: ["phase-6/sub-task-1", "phase-6/sub-task-3"]
branch: "feature/firebase-firestore-migration"
commit_prefix: "feat(phase-4/task-4)"
estimated_files: 8
---

# Phase 4 / Sub-Task 4: Admin Display + Home + Bylaws Components

## Summary

Migrates all admin-display components (announcements, calendar/events, carousel, bylaws) and the
home page from static JSON to Firestore hooks. Key behavior changes: announcements gain expired-item
filtering and pinned-first sort, the BylawsModal is reworked to fetch from the `documents` collection
instead of a hardcoded file, and the CarouselImages component uses `imageUrl` (renamed from `image`).

## Implementation Plan

**`src/components/Announcements.tsx`** + **`AnnouncementsModal.tsx`** + **`PinnedAnnouncement.tsx`**:
- Remove: `import announcements from '../data/announcements.json'`
- Add: `const { data: announcements, loading } = useAnnouncements()`
- The `useAnnouncements` hook already filters expired and sorts by pinned — no filter logic in components
- `PinnedAnnouncement`: render the first item where `pinned == true`, or nothing if none
- `Announcements`/`AnnouncementsModal`: render full list (hook already sorted correctly)
- Note: `createdAt`/`updatedAt` fields now available — can display "Posted on" date

**`src/components/Calendar.tsx`** + **`src/components/UpcomingEvents.tsx`**:
- Remove: `import events from '../data/events.json'`
- Add: `const { data: events, loading } = useEvents()`
- New fields available: `endDate` (multi-day events), `allDay` (boolean)
- `Calendar`: render multi-day events across date range when `endDate` is set
- `UpcomingEvents`: display `endDate` if present (e.g., "Sep 5–7")

**`src/components/Carousel.tsx`**:
- Remove: `import carouselImages from '../data/carouselImages.json'`
- Add: `const { data: images, loading } = useCarouselImages()`
- Rename: `image.image` → `image.imageUrl` in the `<img src={...}>` attribute
- Sort by `order` is already handled by the hook

**`src/components/BylawsModal.tsx`**:
- Currently likely loads a hardcoded document — rework to fetch from `documents` collection
- Add: `const { data: doc, loading } = useActiveDocument('bylaws', '2025-2026')`
- If `doc.source.type == 'pdf'`: render an `<iframe src={doc.source.fileUrl}>` or a download link
- If `doc.source.type == 'text'`: render markdown content (use a simple dangerouslySetInnerHTML or a markdown renderer)
- Show "No bylaws document available" when `doc == null`

**`src/pages/HomePage.tsx`**:
- Replace any JSON imports with hooks already migrated in other sub-tasks
- Compose home page sections from hooks: `usePinnedAnnouncement`, `useCarouselImages`, `useEvents` etc.
- Add loading skeletons for each section

## File Operations

### Edit
- `src/components/Announcements.tsx` — Replace JSON import with `useAnnouncements` hook
- `src/components/AnnouncementsModal.tsx` — Replace JSON import with `useAnnouncements` hook
- `src/components/PinnedAnnouncement.tsx` — Replace JSON import, filter for `pinned == true`
- `src/components/Calendar.tsx` — Replace JSON import with `useEvents` hook, handle `endDate`
- `src/components/UpcomingEvents.tsx` — Replace JSON import with `useEvents` hook
- `src/components/Carousel.tsx` — Replace JSON import with `useCarouselImages` hook, rename `imageUrl`
- `src/components/BylawsModal.tsx` — Rework to fetch from `documents` collection via `useActiveDocument`
- `src/pages/HomePage.tsx` — Remove any remaining JSON imports, ensure all sections use hooks

## Dependencies

### Depends On
- `phase-3/sub-task-2` — All required domain hooks must exist

### Blocks
- `phase-6/sub-task-1` — JSON file deletion
- `phase-6/sub-task-3` — onSnapshot for announcements

## Acceptance Criteria

- [ ] No `import ... from '../data/` in any of the 8 files
- [ ] `PinnedAnnouncement` renders nothing (not an error) when no pinned announcement exists
- [ ] `Carousel` uses `image.imageUrl` (not `image.image`)
- [ ] `BylawsModal` fetches from `documents` collection with `type == 'bylaws'` and `active == true`
- [ ] `BylawsModal` renders PDF in iframe OR markdown text based on `source.type`
- [ ] `Calendar` handles multi-day events with `endDate` set
- [ ] All 8 components have loading states
- [ ] `npm run build` passes with no TypeScript errors in these 8 files

## Commit Convention

`feat(phase-4/task-4): migrate admin display and home components to Firestore hooks`
