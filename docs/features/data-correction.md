---
feature: Data Correction
number: 18
source-paths:
  - src/pages/admin/DataCorrectionAdmin.tsx
  - src/hooks/index.ts
  - api/local-admin-write.js
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
- Add new bowlers or remove existing bowlers from a team; local-bypass writes use the Admin SDK bridge
- Create entirely new teams with a synthetic admin ID (admin-team-{displayId})
- Bowler edits set adminOverride: true to protect records from pipeline overwrites
- Roster removal retains a hidden `rosterRemoved` tombstone with an empty team assignment so historical score references remain valid and the pipeline cannot re-add the bowler

**Edit Scores**
- Select a completed week from a dropdown; loads all matchupDetails for the week
- Displays rows for: regular matchups (have a matchupDetails record), orphan teams (have bowlerScores but no matchupDetails), and missing teams (no data at all)
- Expand any row to open a two-panel inline editor for both teams side-by-side
- Score entry supports two modes: individual bowler scores (per-game, with per-game blind flags) or team-totals-only (when individual scores are unavailable)
- In individual mode, each bowler's Avg is editable for that matchup; the override is stored as `bowlerScores.avgBeforeThisWeek` and immediately drives blind scores, team average, and handicap calculations
- Each team can pin a whole-number per-game handicap for the matchup; blank uses the configured formula, while a pin is stored as `TeamSummary.handicapOverride` and remains in effect during later score edits until cleared or the week is re-ingested
- "+ Add Sub" adds a substitute bowler as an active row for the currently-editing side only: pick an existing league-wide sub-pool bowler or create a new one. New substitutes store a separate entering average on their pool profile, while every appearance requires a manually entered average for that week; the weekly value drives the matchup handicap contribution.
- "Switch Side" flips which panel is editable without re-fetching data
- Save writes corrected bowlerScores (add/update/delete) and updates the matching matchupDetails record; recalculates game totals, points, and handicap
- Re-ingest data runs a server-side LeaguePals refresh for only the selected week, dry-runs first, warns with any adminOverride matchupDetails/bowlerScores values that will be replaced, then overwrites that week's matchups, matchupDetails, and bowlerScores on confirmation

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
- Vercel API: /api/reingest-week (authenticated week-only LeaguePals refresh)
- Firestore: bowlers (read/write — Edit Teams mode)
- Vercel API: /api/local-admin-write (localhost-only roster writes while Firebase Auth is bypassed)
- Firestore: teams (read/write — Edit Teams create-team flow)
- Firebase Auth (route guard)
- useTeams, useScheduleWeeks hooks (from src/hooks/index.ts)
- useSeasonYear from SeasonContext

## Known Issues
Validate Matchups → Auto-fix still sums each bowler's static `enteringAvg` (prior-season baseline) for `teamAvg`/`bowlerAverages` when synthesizing blind docs and recomputing handicap, instead of the current-rolling-average resolution (`weeklyAvg`/`blindBaseAvg`) used everywhere in Edit Scores. Auto-fixed matchups can therefore get a different Team Avg/handicap than the same matchup would get from manual Edit Scores correction. Not fixed yet — low usage path, flag if Auto-fix output looks off.

## Notes
The Firestore collection for per-team matchup summaries is matchupDetails, not weeklyMatchupDetails. The weeklyMatchupDetails name appears in older data files (scripts/leaguepals-data/) but the live Firestore collection and all admin reads/writes use matchupDetails.

Substitute bowlers reuse the `bowlers` collection rather than a separate collection: a sub-pool entry is a normal Bowler doc with `isSubPool: true` and `teamId: ''`, and a newly created sub stores their `enteringAvg` independently of any weekly appearance. `useBowlers()` (src/hooks/index.ts) filters `isSubPool` bowlers out of all season-wide/public queries so they never leak into leaderboards, award leaders, or team rosters — only the admin panel's direct Firestore query (filtered on `isSubPool == true`) can see the pool. A substitute's bowlerScore doc carries `isSubstitute: true` and `substituteAvg` (the manually entered average for that matchup); their own `bowlerId` is used so their score counts toward their own profile, same as any other bowler.
