---
feature: Season Context
number: 22
source-paths:
  - src/context/SeasonContext.tsx
diagram: ../diagrams/features/season-context.md
status: no diagram
---

## Intent
Propagates the active season year through the component tree so all pages and hooks share the same season without prop-drilling.

## Key Behaviors
- SeasonProvider wraps the entire App
- useSeasonYear() hook returns the current active season year string (e.g., '2025-2026')
- Season is read from the Firestore `settings/global` document (collection: `settings`, doc ID: `global`), field `currentSeasonYear` — the admin panel can update this value at any time
- HistoryPage manages its own local season selection independently of context

## Conditional Paths
- If the `settings/global` document does not exist or is still loading, context falls back to the hardcoded default `'2025-2026'`
- SeasonContext drives all public pages
- Admin pages use it for scoping data reads

## External Dependencies
- Firestore: `settings` collection, `global` document (field: `currentSeasonYear`)
- useDocument hook from useFirestore.ts (called directly, NOT via a domain hook)

## Known Issues
None

## Notes
HistoryPage intentionally bypasses SeasonContext with local state so users can browse past seasons without affecting the rest of the site's data
