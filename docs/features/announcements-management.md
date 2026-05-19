---
feature: Announcements Management
number: 13
source-paths:
  - src/pages/admin/AnnouncementsAdmin.tsx
diagram: ../diagrams/features/announcements-management.md
status: no diagram
---

## Intent
Allows admins to create, edit, and delete league announcements that appear on the public site.

## Key Behaviors
- View list of all announcements ordered by date descending
- Create new announcement with: title (required), date (required), message (body), type (info/reminder/event), priority (high/normal/low), optional expiry date, and pinned toggle
- Edit any existing announcement
- Delete an announcement (window.confirm guard)

## Conditional Paths
- If no announcements exist, list shows empty state
- Expired announcements still visible in admin (unlike public view)
- Save validates that title and date are both non-empty before Firestore write; alerts if either is missing
- Writes are blocked with an alert if no authenticated user is present (belt-and-suspenders check beyond RequireAuth)

## External Dependencies
- Firestore: announcements (create, read, update, delete)
- Firebase Auth (route guard via RequireAuth)
- nowIso() from src/utils/admin.ts for timestamps

## Known Issues
None

## Notes
Admin view shows ALL announcements including expired ones; public view filters expired client-side
