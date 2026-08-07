---
feature: Season Details
number: 24
source-paths:
  - src/pages/admin/SettingsAdmin.tsx
  - src/pages/admin/SeasonScheduleBuilder.tsx
---

## Intent
Lets admins define and maintain the season schedule (start date, total bowling weeks, holiday/skip dates) and public week visibility directly in one Season Details view, then review the resulting week-by-week breakdown. Acts as the source of truth for the schedule before and between LeaguePals data runs.

## Key Behaviors

### Week table (view mode — fully read-only)
- Shows a summary line: "N bowling weeks of M configured across P calendar entries"
- Renders a table of every `ScheduleWeek` document for the selected season in date order
- Each row: week number (`—` for skips), formatted local date, colour-coded status pill, the week's note (`ScheduleWeek.notes`, line breaks preserved) plus a small auto-generated hint below it (position-round flag · skip reason), and a Visible/Hidden status label
- Nothing in this table is editable — Notes and Public visibility used to be inline-editable here with an instant/auto-save, which meant an admin could type or click a change without any explicit "save" step. Both now only take effect via the schedule builder's "Save Schedule" button (see below), matching how Skip?/Holiday Note/Dues?/Event already worked
- The two "Show all" / "Hide weeks" buttons above the table remain instant-apply bulk actions — they're deliberate one-click operations, not a stray editable field, and they're the only way to change visibility for a completed (already-bowled) week, since the builder never rewrites completed documents
- Notes and visibility shown here are what renders on the public Season Schedule page (see `season-schedule.md`)
- Responds to the Active Season dropdown — changing the dropdown previews any season before saving

### Schedule builder (Set Up / Edit) — the only place to edit a non-completed week
- "Set Up Schedule" button appears when no schedule data exists for the selected season
- "Edit Schedule" button appears when schedule data already exists
- Builder renders inline within the Season Details card; the read-only week table is replaced while the builder is active
- Admin enters: **season start date** (first bowling night) and **total bowling weeks**
- Preview table updates live as inputs change — no separate "preview" step required. Every field below is local component state until "Save Schedule" is clicked; nothing writes to Firestore per-keystroke or per-click
- Each row in the preview has a **"Skip?" checkbox**; checking it marks that calendar date as a holiday
  - Skip weeks do NOT count toward the total bowling week target — the season extends by one additional date at the end for each skip added
  - Example: Week 1 → [skip] → Week 2 (not Week 1 → [skip week 2] → Week 3)
- Each skip row shows a **Holiday Note** text input for the reason (e.g. "Thanksgiving Break")
- Each non-skip row has a **"Dues?" checkbox**, defaulting checked; uncheck it for a week teams don't owe dues (e.g. a banquet night). Skip rows always show "—" (no bowling, no dues) and can't be toggled. Completed rows are read-only, showing "Owed"/"Waived" from the existing `ScheduleWeek.duesOwed` value (defaults to Owed when absent) since the builder never rewrites completed documents
- Each non-skip row has an **"Event" dropdown** to tag it as a playoff/championship week: First/Second Half Playoffs Week 1, First/Second Half Playoffs Week 2, First/Second Half Championship, or League Championship (see `SCHEDULE_EVENT_OPTIONS` in `src/utils/scheduleEvents.ts`). Selecting one shows a live badge preview next to the dropdown. Skip rows always show "—" and can't be tagged. Completed rows are read-only, showing the badge plus its full label from the existing `ScheduleWeek.specialEvent` value
- Every non-completed row (upcoming **and** skip) has an editable multi-line **Notes** textarea. Completed rows are read-only, showing the existing note (or "—")
- Every non-completed row (upcoming **and** skip) has a **"Public?" checkbox**, defaulting checked. Completed rows are read-only, showing a Visible/Hidden status label — use the bulk visibility actions on the view-mode table to change a completed week's visibility
- Completed weeks (already bowled) are shown with a "Bowled" label in the Skip? column and cannot be toggled or overwritten
- Start date is locked when any completed weeks exist

### Save behaviour
- Batch-writes all upcoming and skip entries to `scheduleWeeks/{YYYY-MM-DD}` (full document overwrite, not a merge)
- Writes `notes` (trimmed, or `null` if empty) and `visible` for every non-completed entry from that row's local builder state — this is the only path that persists either field for upcoming/skip weeks
- Writes `duesOwed` for every non-completed entry: `false` for skip rows, otherwise the row's checkbox state (default `true`, tracked as an exceptions-only "unchecked dates" set so newly generated dates default checked without needing to be pre-seeded)
- Writes `specialEvent` for every non-completed entry: `null` for skip rows, otherwise the row's dropdown selection (or `null` if left as "— None —")
- Merges the edited total into `leagueConfig.totalWeeks` so the configured season length matches the calendar
- Never overwrites completed documents that remain within the edited schedule
- Deletes every calendar entry absent from the edited schedule, including a completed surplus week after reducing the total; matchup and score records are retained
- On success: builder collapses, read-only table reappears, success message shown
- On season switch (dropdown): builder collapses automatically, form state resets

## Conditional Paths
- The season dropdown (`selected`) is populated from the `seasons` collection, so a season must exist there before it can be selected — either from a prior LeaguePals import, or staged in advance via the Create Season control (see `league-settings.md`)
- While `useScheduleWeeks` or `useLeagueConfig` are loading, shows "Loading schedule…"
- Section hidden entirely when `selected` is empty (briefly on initial page load)
- When `leagueConfig.totalWeeks` is absent, the "of M configured" portion is omitted from the summary
- When `configuredTotalWeeks` prop is present, used as the initial total-weeks value in the builder; falls back to count from existing schedule, then defaults to 32
- "preview, not yet active" label appears when selected season differs from current active season
- When editing with no completed weeks: start date is editable; any row can be toggled as skip
- When editing with completed weeks: start date is locked; completed rows show "Bowled" and cannot be toggled

## External Dependencies
- Firestore: `scheduleWeeks` (read/write — `useScheduleWeeks(selected)`, filtered by `seasonYear`, ordered by `date` asc; the schedule builder is the only write path for non-completed weeks, via `writeBatch`; the view-mode bulk visibility actions write via `set-week-visibility`)
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
