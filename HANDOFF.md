# Session Handoff — Late Night Happy Hour League Site

**Branch:** `feature/firebase-firestore-migration`
**Date:** 2026-04-21
**Context used:** ~95% — start a fresh conversation before continuing

---

## What Was Done This Session

### 1. Individual Score Highlights on Home Page
Added two new highlight cards to the Week Highlights grid: **High Individual Game** and **High Individual Series** (top 3 per category for the latest completed week).

- `src/hooks/index.ts` — new `useBowlerScoresByWeek(week, seasonYear)` hook using sentinel pattern
- `firestore.indexes.json` — new index: `bowlerScores` on `seasonYear ASC, week ASC, blinded ASC`
- `src/pages/HomePage.tsx` — imports hook, adds `highIndividualGame` / `highIndividualSeries` memos, renders two new cards
- `src/pages/HomePage.css` — `.highlight-team-sub` for muted team name under bowler name

### 2. Week Highlights — 4 Cards on One Row
Changed `.week-highlights` grid from `repeat(2, 1fr)` to `repeat(4, 1fr)`. Breakpoints: ≥1024px = 4-col, ≤1024px = 2×2, ≤480px = 1-col. Tightened padding on `.highlight-card`.

### 3. Half Awards — Remove Individual Handicap Awards
Removed **High Game Handicap** and **High Series Handicap** from the individual awards section. Team handicap awards were also removed here but then restored (see #4). Dead code cleaned: `byGameHdcp`, `bySeriesHdcp` sorts removed.

### 4. Half Awards — Restore Team Handicap Awards
Re-added **Team High Game Handicap** and **Team High Series Handicap** (team handicap IS calculated, individual is not). Full `TeamHalf` interface restored with all four handicap tracking fields. Computation loop restored.

### 5. Half Awards — Championship Board Redesign
Full redesign of `AwardLeaders.tsx` and `AwardLeaders.css`:
- Two side-by-side panels (`1fr 1fr` grid) instead of stacked layout
- Each panel: gold gradient cap stripe (3px), Anton title, status badge (In Progress / Final / Upcoming)
- Award rows: category label + prize pill on top line; winner name + dominant Anton score (2.6rem, gold glow) on bottom
- TEAM / INDIVIDUAL section dividers with fading gold rule
- Subtle hover per row
- `AwardRow` sub-component replaces `AwardCard`

### 6. Half Awards — Prize Amount Positioning
Moved prize pill to left-aligned (right of category name) by removing `justify-content: space-between` from `.award-row-meta`.

### 7. Schedule Page — Remove Completed/Upcoming Legend
Removed the `.cal-legend` block (the "● Completed / ● Upcoming" text labels above the calendars). Calendar dots on individual day cells unchanged.

### 8. Teams View — Week Numbers Above Dots
Wrapped each streak dot in `.sdot-col` flex column with `.sdot-week-num` label above the dot. Week number comes from `teamMatchups[i]?.week`.

### 9. Teams View — Pending (Upcoming) Dots
Added `useMatchups` hook to TeamsPage. New `pendingWeeks` memo: scheduled but not-yet-completed matchups for the selected team. Renders as `.sdot-pending` (dimmed gold) dots after the W/L/T dots.

### 10. Teams View — Scratch Average in Sidebar
Added `.roster-name-block` flex column wrapping team name and average. Shows `{avg} | {avg*3} avg` (game avg | series avg) in `.roster-avg` below each team name. Gold color on active row.

### 11. Lanes View — Bowler Selection
When a team is selected in the filter, the team's bowlers appear as a second row of pills below. Selecting a bowler:
- Lane cards switch to show that bowler's stats per lane pair (appearances, avg series, high series) derived from `useBowlerScores`
- Lane detail panel (when a card is clicked) shows that bowler's G1/G2/G3/Series by week on that pair
- Deselecting the team resets the bowler selection

New hooks used in `LanesPage`: `useBowlers`, `useBowlerScores`.
New memos: `teamBowlerList`, `bowlerLaneStats` (Map<baseLane, stats>), `bowlerWeeklyScoresForLane`.
New CSS: `.lanes-bowler-pills`, `.lanes-bowler-pill`, `.lanes-bowler-pill-active`, `.ld-empty`.

### 12. Bowlers View — PB Badge / Duplicate Date Bug Fix
`PB` badge and parenthetical actual date were showing on every row because `actualBowlDate === date` for regular weeks. Fixed both conditions to: `score.preBowled && score.actualBowlDate && score.actualBowlDate !== score.date`.

### 13. Bowlers View — Opponent Not Populated (Transform Fix)
Root cause: `populateBowlerScores()` in `scripts/transform-data.js` left `opponentTeamId` and `opponentTeamName` as `''` (marked TODO from phase-2). Fix:
- Built `oppNameLookup` map inside `populateBowlerScores()` from `standings.data.standings`
- Wired `opponentTeamId: laneInfo?.opponentLpId ?? ''` and `opponentTeamName` from the lookup

> **ACTION REQUIRED:** Run `npm run update-data` to re-transform and backfill opponent fields into existing Firestore `bowlerScores` documents.

---

## Key Files Modified This Session

| File | Change |
|------|--------|
| `src/hooks/index.ts` | `useBowlerScoresByWeek` hook added |
| `firestore.indexes.json` | New bowlerScores index (seasonYear+week+blinded) |
| `src/pages/HomePage.tsx` | Individual highlight cards, 4-col grid |
| `src/pages/HomePage.css` | Grid layout, `.highlight-team-sub` |
| `src/components/AwardLeaders.tsx` | Full redesign — Championship Board panels |
| `src/components/AwardLeaders.css` | Full redesign — scoreboard aesthetic |
| `src/pages/SchedulePage.tsx` | Remove Completed/Upcoming legend |
| `src/pages/TeamsPage.tsx` | Week numbers on dots, pending dots, roster avg, `useMatchups` |
| `src/pages/TeamsPage.css` | `.sdot-col`, `.sdot-week-num`, `.sdot-pending`, `.roster-avg` |
| `src/pages/LanesPage.tsx` | Bowler drill-down: pills, lane stats, detail table |
| `src/pages/LanesPage.css` | `.lanes-bowler-pills`, `.lanes-bowler-pill`, `.ld-empty` |
| `src/pages/BowlersPage.tsx` | PB badge / duplicate date fix |
| `scripts/transform-data.js` | Opponent fields wired in `populateBowlerScores()` |

---

## Pending Actions

1. **`npm run update-data`** — must be run to backfill opponent team names into Firestore `bowlerScores` documents
2. **`firebase deploy --only firestore:indexes`** — deploy the new `bowlerScores` composite index
3. **Verify** opponent column populates correctly in the Bowlers view after re-transform
