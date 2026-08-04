---
feature: League Standings
number: 2
source-paths:
  - src/pages/StandingsPage.tsx
  - src/components/LeagueStandings.tsx
  - src/components/AwardLeaders.tsx
  - src/components/SeasonPlaceholder.tsx
diagram: ../diagrams/features/league-standings.md
status: stale
---

## Intent
Displays the current season standings table and half-season award leaders side by side on a single page.

## Non-Goals
- No per-week standings drill-down (WeekSelector is on MatchupsPage, not here)
- No PDF download on this page (StandingsPdfModal lives on MatchupsPage)

## Key Behaviors
- View standings table sorted by points desc, wins as tiebreaker
- View half-season award leaders for first half (wks 1–16) and second half (wks 17–32)

## Output Detail

**Standings table columns:** Rank · Team · Captain · W · L · Win% · Points
- Top 3 rows receive a highlight style; rank 1 shows a trophy icon

**Award categories (rendered per half by `HalfAwards`):**

| Category | Prize | Source field |
|----------|-------|-------------|
| Team High Game Scratch | $100 | best single-game scratch total per week |
| Team High Series Scratch | $100 | `scratchSeries` per week |
| Team High Game Handicap | $100 | best game scratch + `handicapPerGame` |
| Team High Series Handicap | $100 | `totalSeries` (scratch + handicap) |
| Individual High Average | $50 | `bowler.average` (season aggregate) |
| Individual High Game | $50 | `bowler.highGame` (season aggregate) |
| Individual High Series | $50 | `bowler.highSeries` (season aggregate) |

Note: Individual award fields are season-level aggregates, not half-specific. Award rows show winner name, score, team name, and optional scratch+handicap breakdown for handicap awards.

## States

**LeagueStandings:**

| State | Condition | User sees |
|-------|-----------|-----------|
| Loading | `teams` fetch in flight | "Loading standings…" placeholder |
| Populated | teams loaded, array non-empty | Standings table with all rows |
| Empty | teams loaded, array empty | Empty table body (no message — silent) |

**AwardLeaders (applies to both half panels):**

| State | Condition | User sees |
|-------|-----------|-----------|
| Loading | any of bowlers / matchupDetails / scheduleWeeks loading | "Loading award data…" placeholder |
| Upcoming | `hasData = false` (no completed weeks in half range) | Award rows with `—` values, "Upcoming" badge |
| In Progress | `hasData = true`, `complete = false` | Current leaders with "In Progress" badge |
| Final | `hasData = true`, `complete = true` | Season winners with "Final" badge |

Note: First half `hasData` is hardcoded `true` — it shows live leaders from week 1 onward, never "Upcoming".

## Conditional Paths
- AwardLeaders loading gate: if any of the 3 hook fetches is loading, render placeholder instead of award panels
- If `seasonActive` is false on `settings/global` (between seasons), `StandingsPage` renders `SeasonPlaceholder` instead of the standings table and award panels — prevents stale prior-season data from being shown as current

## External Dependencies
- Firestore `teams` — ordered by points desc; consumed by `LeagueStandings` with hardcoded season year
- Firestore `bowlers` — individual aggregate stats (average, highGame, highSeries); consumed by `AwardLeaders`
- Firestore `matchupDetails` — per-team per-week score totals; used to compute team awards
- Firestore `scheduleWeeks` — week metadata and status; used to determine which weeks belong to each half and whether a half is complete
- `SeasonContext` — `AwardLeaders` reads `seasonYear` via `useSeasonYear()`; `LeagueStandings` bypasses this

## Known Issues
**Hardcoded season year:** `LeagueStandings` passes `'2025-2026'` as a literal string to `useTeams` (`LeagueStandings.tsx:21`) instead of reading from `useSeasonYear()`. Standings will silently show the wrong season after rollover. Fix: accept `seasonYear` as a prop (or call `useSeasonYear()` directly) and pass it to `useTeams`.

## Notes
- `HALF_BOUNDARY = 16` is a module constant in `AwardLeaders.tsx`; first half = wks 1–16, second half = wks 17–32
- `computeAwards` is a pure function (no hooks) — straightforward to unit-test in isolation
- Individual awards use season-level aggregate fields from `bowlers` collection, not per-half `BowlerScore` data. This is intentional (see `AwardLeaders.tsx` docstring) but means individual "half" awards are technically season bests, not half-specific bests. See ADR if a future change is considered.
