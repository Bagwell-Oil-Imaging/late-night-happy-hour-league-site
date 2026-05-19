---
feature: Data Correction
number: 18
source-paths:
  - src/pages/admin/DataCorrectionAdmin.tsx
diagram: ../diagrams/features/data-correction.md
status: no diagram
---

## Intent
Lets admins fix team rosters, individual bowler scores, and matchup records after the weekly data sync without re-running the full pipeline.

## Key Behaviors
Three top-level modes selectable via tab buttons:

**Edit Teams**
- Expandable list of all teams for the current season
- Per-team: view and edit bowler roster (first name, last name, entering average)
- Add new bowlers or delete existing bowlers from a team
- Create entirely new teams with a synthetic admin ID (admin-team-{displayId})
- Bowler edits set adminOverride: true to protect records from pipeline overwrites

**Edit Scores**
- Select a completed week from a dropdown; loads all matchupDetails for the week
- Displays rows for: regular matchups (have a matchupDetails record), orphan teams (have bowlerScores but no matchupDetails), and missing teams (no data at all)
- Expand any row to open a two-panel inline editor for both teams side-by-side
- Score entry supports two modes: individual bowler scores (per-game, with per-game blind flags) or team-totals-only (when individual scores are unavailable)
- "Switch Side" flips which panel is editable without re-fetching data
- Save writes corrected bowlerScores (add/update/delete) and updates the matching matchupDetails record; recalculates game totals, points, and handicap

**Validate Matchups**
- Scans all matchupDetails and bowlerScores for the season
- Detects mismatches: wrong bowler count per team, totals that don't match the sum of actual bowlerScore docs
- Auto-fix mode resolves detected mismatches by rewriting the affected bowlerScores and matchupDetails

## Conditional Paths
- Auto-fix only runs when validation detects mismatches
- Manual edit (Edit Scores) is always available regardless of validation state
- If selected week has no matchupDetails, only orphan/missing rows appear
- Orphan team entries wait for the admin to select an opponent before the right panel loads
- Teams named "vacant" are filtered out of all row lists
- normalizeTeamName is used to match team names across collections when IDs are unavailable

## External Dependencies
- Firestore: matchupDetails (read/write — collection name is matchupDetails, NOT weeklyMatchupDetails)
- Firestore: bowlerScores (read/write)
- Firestore: bowlers (read/write — Edit Teams mode)
- Firestore: teams (read/write — Edit Teams create-team flow)
- Firebase Auth (route guard)
- useTeams, useScheduleWeeks hooks (from src/hooks/index.ts)
- useSeasonYear from SeasonContext

## Known Issues
None

## Notes
The Firestore collection for per-team matchup summaries is matchupDetails, not weeklyMatchupDetails. The weeklyMatchupDetails name appears in older data files (scripts/leaguepals-data/) but the live Firestore collection and all admin reads/writes use matchupDetails.
