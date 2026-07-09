---
feature: Season Details
number: 24
source-paths:
  - src/pages/admin/SettingsAdmin.tsx
  - src/pages/admin/SeasonScheduleBuilder.tsx
---

## Intent
Lets admins define and maintain the season schedule (start date, total bowling weeks, holiday/skip dates) directly in Site Settings, then view the resulting week-by-week breakdown. Acts as the source of truth for the schedule before and between LeaguePals data runs.

## Key Behaviors

### Read-only view
- Shows a summary line: "N bowling weeks of M configured across P calendar entries"
- Renders a table of every `ScheduleWeek` document for the selected season in date order
- Each row: week number (`—` for skips), formatted local date, colour-coded status pill, notes (position-round flag · event name · skip reason)
- Responds to the Active Season dropdown — changing the dropdown previews any season before saving

### Schedule builder (Set Up / Edit)
- "Set Up Schedule" button appears when no schedule data exists for the selected season
- "Edit Schedule" button appears when schedule data already exists
- Builder renders inline within the Season Details card; read-only table is replaced while builder is active
- Admin enters: **season start date** (first bowling night) and **total bowling weeks**
- Preview table updates live as inputs change — no separate "preview" step required
- Each row in the preview has a **"Skip?" checkbox**; checking it marks that calendar date as a holiday
  - Skip weeks do NOT count toward the total bowling week target — the season extends by one additional date at the end for each skip added
  - Example: Week 1 → [skip] → Week 2 (not Week 1 → [skip week 2] → Week 3)
- Each skip row shows a **Holiday Note** text input for the reason (e.g. "Thanksgiving Break")
- Completed weeks (already bowled) are shown with a "Bowled" label and cannot be toggled or overwritten
- Start date is locked when any completed weeks exist

### Save behaviour
- Batch-writes all upcoming and skip entries to `scheduleWeeks/{YYYY-MM-DD}`
- Never overwrites documents with `status: 'completed'`
- Deletes any orphaned upcoming/skip documents from a previous schedule version that are absent from the new one
- On success: builder collapses, read-only table reappears, success message shown
- On season switch (dropdown): builder collapses automatically, form state resets

## Conditional Paths
- While `useScheduleWeeks` or `useLeagueConfig` are loading, shows "Loading schedule…"
- Section hidden entirely when `selected` is empty (briefly on initial page load)
- When `leagueConfig.totalWeeks` is absent, the "of M configured" portion is omitted from the summary
- When `configuredTotalWeeks` prop is present, used as the initial total-weeks value in the builder; falls back to count from existing schedule, then defaults to 32
- "preview, not yet active" label appears when selected season differs from current active season
- When editing with no completed weeks: start date is editable; any row can be toggled as skip
- When editing with completed weeks: start date is locked; completed rows show "Bowled" and cannot be toggled

## External Dependencies
- Firestore: `scheduleWeeks` (read/write — `useScheduleWeeks(selected)`, filtered by `seasonYear`, ordered by `date` asc; builder writes via `writeBatch`)
- Firestore: `leagueConfig` (read — `useLeagueConfig(selected)`, document ID = `seasonYear`, provides `totalWeeks`)
- Active Season dropdown in `SettingsAdmin` (drives which season is viewed/edited)

## Known Issues
None

## Notes

### Interaction with the data pipeline
Admin-entered schedule entries have `status: 'upcoming'`. When `npm run update-data` runs (`fetch-league-data.js` → `transform-data.js`), the transform script currently **overwrites** `scheduleWeeks` entirely from LeaguePals data. This means:

- **Before LeaguePals has season data**: admin schedule is the active source of truth. Public site pages (SchedulePage, AwardLeaders) show the admin-entered dates immediately.
- **Once transform runs with LeaguePals data**: transform overwrites the admin-entered entries. If LeaguePals has the same dates and holidays, the result is consistent. If there are discrepancies, LeaguePals wins.

A future improvement would make `transform-data.js` merge rather than overwrite — preserving admin-entered `skipReason` and respecting admin-defined holidays that haven't yet appeared in LeaguePals. This is not implemented and would require changes to `scripts/transform-data.js`.

### Position rounds
`positionRound` is always written as `false` by the builder. The transform script detects position rounds from LeaguePals `isPositionRound` and `splitMatches` fields and sets this flag when it runs. Admin cannot designate position rounds via this builder.
