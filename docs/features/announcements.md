---
feature: Announcements
number: 9
source-paths:
  - src/components/AnnouncementsModal.tsx
  - src/components/Header.tsx
diagram: ../diagrams/features/announcements.md
status: no diagram
---

## Intent
Surfaces time-sensitive league news to members via a modal and a badge count in the header navigation.

## Key Behaviors
- Header shows badge with count of active non-expired announcements
- Click badge or nav item to open AnnouncementsModal
- Announcements sorted pinned first, then by priority (high/normal/low), then by date desc
- Modal dismisses on close button or Escape

## Conditional Paths
- If announcement count is 0, badge is hidden
- Expired announcements (expiresAt < today) are filtered client-side
- Pinned announcements always appear first regardless of priority

## External Dependencies
- Firestore: announcements (all documents fetched; expiry filtered in JS because Firestore cannot express null-or-date queries without a complex index)

## Known Issues
None

## Notes
Client-side filtering is intentional — see useAnnouncements hook comment; collection expected to stay small (<100 documents)
