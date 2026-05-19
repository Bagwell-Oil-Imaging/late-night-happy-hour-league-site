---
feature: League Settings
number: 17
source-paths:
  - src/pages/admin/SettingsAdmin.tsx
diagram: ../diagrams/features/league-settings.md
status: no diagram
---

## Intent
Allows admins to configure the active season year, which controls which season's data is shown across the entire public site.

## Key Behaviors
- View the currently active season year
- Select a new active season from a dropdown populated by the seasons Firestore collection
- Save updates settings/global with the selected season year
- Save button is disabled until the selection differs from the current saved value
- Change takes effect immediately for all visitors via the SeasonContext real-time Firestore listener

## Conditional Paths
- If settings/global document doesn't exist, the dropdown initialises with no pre-selected value
- If no seasons exist in the seasons collection, dropdown shows "No seasons available"
- Save uses setDoc with merge: true so any future settings fields are preserved
- Success shows an inline confirmation message; error shows an inline error message

## External Dependencies
- Firestore: settings (read/write — document ID is "global", field is currentSeasonYear)
- Firestore: seasons (read — useSeasons hook populates the season dropdown)
- Firebase Auth (route guard)

## Known Issues
None

## Notes
The Firestore path is settings/global, not leagueConfig. The leagueConfig collection stores per-season league configuration used by the pipeline and public pages; SettingsAdmin only manages the active season pointer in settings/global.
