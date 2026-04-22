---
id: "phase-5/sub-task-2"
title: "Announcements + Events + Carousel CRUD Panels"
phase: 5
task: 2
status: pending
depends_on: ["phase-5/sub-task-1"]
blocks: []
branch: "feature/firebase-firestore-migration"
commit_prefix: "feat(phase-5/task-2)"
estimated_files: 6
---

# Phase 5 / Sub-Task 2: Announcements + Events + Carousel CRUD Panels

## Summary

Builds admin CRUD panels for the three simplest admin-managed collections: `announcements`,
`events`, and `carouselImages`. Each panel lives at a dedicated `/admin/<collection>` route and
provides list, create, edit, and delete operations using the Firestore `addDoc`, `updateDoc`, and
`deleteDoc` APIs. All writes set `createdAt`/`updatedAt` timestamps.

## Implementation Plan

### Pattern for all 3 panels:
- A list view showing all existing documents
- An inline or modal form for create/edit
- Delete button with a confirmation dialog
- All writes guarded by `auth.currentUser != null` (belt-and-suspenders on top of route guard)
- `createdAt` set on add; `updatedAt` set on every save

### `src/pages/admin/AnnouncementsAdmin.tsx`:
- List: title, date, type, priority, pinned badge, expiresAt
- Form fields: title (text), message (textarea), date (date), type (select: reminder/event/info),
  priority (select: low/normal/high), pinned (checkbox), expiresAt (date, optional)
- Add/Edit: use `addDoc`/`updateDoc` on `announcements` collection
- Delete: `deleteDoc` with confirmation

### `src/pages/admin/EventsAdmin.tsx`:
- List: title, date, endDate, location, type
- Form fields: title, date (date), endDate (date, optional), allDay (checkbox), location, type
  (select: regular/tournament/social/banquet), description (textarea)
- Add/Edit/Delete: same pattern

### `src/pages/admin/CarouselAdmin.tsx`:
- List: image thumbnail (using `imageUrl`), title, order
- Form fields: title, description, imageUrl (text input — Firebase Storage upload deferred to
  a future enhancement; accept URL string for now), alt (text), order (number)
- Reorder: clicking up/down arrows swaps `order` values between adjacent items
- Add/Edit/Delete: same pattern

### Shared utilities:
- Create `src/utils/admin.ts` with:
  - `nowIso()` → `new Date().toISOString()` helper
  - `todayIso()` → `new Date().toISOString().split('T')[0]` helper

## File Operations

### Add
- `src/pages/admin/AnnouncementsAdmin.tsx` — Announcements CRUD panel
- `src/pages/admin/AnnouncementsAdmin.css` — Styles
- `src/pages/admin/EventsAdmin.tsx` — Events CRUD panel
- `src/pages/admin/EventsAdmin.css` — Styles
- `src/pages/admin/CarouselAdmin.tsx` — Carousel CRUD panel with reorder
- `src/utils/admin.ts` — Shared admin utility functions

### Edit
- `src/App.tsx` — Wire `/admin/announcements`, `/admin/events`, `/admin/carousel` routes to new panels

## Dependencies

### Depends On
- `phase-5/sub-task-1` — `RequireAuth` and `AdminLayout` must exist; routes registered

### Blocks
- Nothing

## Acceptance Criteria

- [ ] `/admin/announcements` lists all announcements with create/edit/delete
- [ ] Announcement form includes `pinned` checkbox and `expiresAt` date picker
- [ ] `/admin/events` lists all events with create/edit/delete
- [ ] Events form includes `endDate` (optional) and `allDay` checkbox
- [ ] `/admin/carousel` lists carousel images with create/edit/delete and order controls
- [ ] All writes include `createdAt` (on create) and `updatedAt` (on create and edit)
- [ ] All delete operations require confirmation
- [ ] Unauthenticated users are redirected to login (route guard enforced)
- [ ] `npm run build` passes

## Commit Convention

`feat(phase-5/task-2): add announcements, events, and carousel admin CRUD panels`
