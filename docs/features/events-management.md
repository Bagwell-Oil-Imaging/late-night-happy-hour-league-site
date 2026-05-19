---
feature: Events Management
number: 14
source-paths:
  - src/pages/admin/EventsAdmin.tsx
diagram: ../diagrams/features/events-management.md
status: no diagram
---

## Intent
Allows admins to manage league events (tournaments, parties, special nights) that appear on the public site.

## Key Behaviors
- View list of all events ordered by date descending (admin view)
- Create new event with: title (required), date (required), optional end date, allDay toggle, location, type (regular/tournament/social/banquet), and description
- Edit existing event
- Delete event (window.confirm guard)

## Conditional Paths
- If no events exist, list shows empty state
- Save validates that both title and date are non-empty; alerts if either is missing
- Writes are blocked with an alert if no authenticated user is present (belt-and-suspenders check beyond RequireAuth)

## External Dependencies
- Firestore: events (CRUD)
- Firebase Auth (route guard)
- nowIso() from src/utils/admin.ts

## Known Issues
None

## Notes
Events are sorted by date asc on the public site (useEvents hook); admin view may show unsorted
