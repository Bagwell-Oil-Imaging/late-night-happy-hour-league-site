/**
 * @file SeasonScheduleBuilder.tsx
 * @module pages/admin/SeasonScheduleBuilder
 *
 * Inline schedule builder rendered inside the Site Settings admin page.
 *
 * Admin flow:
 *   1. Enter the first bowling date and total bowling weeks for the season.
 *   2. Check "Skip" on any row to mark that calendar date as a holiday/break.
 *      The season automatically extends one additional date at the end so the
 *      total bowling-week count stays correct.
 *   3. Add an optional note for each skipped date (e.g. "Thanksgiving Break").
 *   4. "Dues?" defaults checked on every non-skip date; uncheck it for a week
 *      where teams don't owe dues (e.g. a banquet night). Skip weeks are
 *      always unchecked — no bowling means no dues.
 *   5. Tag a week as playoffs/championship via the "Event" dropdown — renders
 *      a bronze/silver/gold trophy or gold crown badge on the public schedule
 *      (see `ScheduleEventBadge`). Skip weeks can't be tagged.
 *   6. Edit the "Notes" and "Public?" columns for any non-completed week.
 *   7. Review the live-updating preview table and click "Save Schedule".
 *
 * This is the only place notes, dues, event tags, and public visibility can be
 * edited for upcoming/skip weeks — none of it writes until "Save Schedule" is
 * clicked, unlike the always-editable inline controls this replaced.
 *
 * Firestore write behaviour:
 *   - Batch-sets every upcoming and skip entry in scheduleWeeks/{YYYY-MM-DD}.
 *   - Never overwrites documents whose status is 'completed' (bowled weeks) —
 *     their notes/dues/event/visibility can only be changed via the bulk
 *     visibility actions or a direct Firestore edit.
 *   - Deletes orphaned upcoming/skip documents that are no longer in the new
 *     schedule (only relevant when editing an existing schedule).
 *
 * Component lifecycle:
 *   The parent passes key={seasonYear} so React remounts this component
 *   whenever the admin switches seasons, resetting all form state automatically.
 */

import { useState, useMemo } from 'react'
import { writeBatch, doc } from 'firebase/firestore'
import { db } from '../../firebase'
import { isLocalAdminBypass, localAdminWrite } from '../../utils/localAdmin'
import { SCHEDULE_EVENT_CONFIG, SCHEDULE_EVENT_OPTIONS } from '../../utils/scheduleEvents'
import ScheduleEventBadge from '../../components/ScheduleEventBadge'
import type { ScheduleWeek, ScheduleWeekEvent } from '../../types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A single row in the live schedule preview.
 * Derived from builder state — never persisted directly.
 */
interface GeneratedEntry {
  /** YYYY-MM-DD calendar date */
  date: string
  /** Sequential bowling week number; null for skip entries */
  week: number | null
  /** Rendering status for this row */
  status: 'upcoming' | 'skip' | 'completed'
  /** Admin-entered note for skip weeks; empty string when not a skip */
  skipReason: string
  /** True for completed weeks — cannot be toggled or overwritten */
  locked: boolean
  /** Whether teams owe weekly dues for this date. Always false for skip entries. */
  duesOwed: boolean
  /** Playoff/championship tag, if any. Always null for skip entries. */
  specialEvent: ScheduleWeekEvent | null
  /** Free-text admin note. Empty string means none — converted to null on save. */
  notes: string
  /** Public visibility for this date. */
  visible: boolean
}

// ---------------------------------------------------------------------------
// Pure helpers (module level — no recreation on each render)
// ---------------------------------------------------------------------------

/**
 * Converts a Date to a YYYY-MM-DD string using local-time fields.
 * Using getFullYear/getMonth/getDate avoids the UTC midnight shift that
 * causes a date constructed from a plain ISO string to display as the
 * prior day in UTC-negative timezones.
 */
function toDateStr(d: Date): string {
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-')
}

/**
 * Parses a YYYY-MM-DD string into a local-time Date.
 * Avoids the UTC shift described in toDateStr.
 */
function parseLocal(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/**
 * Formats a YYYY-MM-DD string to a short human-readable date label
 * using local time (e.g. "Thu, Sep 4, 2025").
 *
 * @param dateStr - YYYY-MM-DD string
 */
function formatDate(dateStr: string): string {
  return parseLocal(dateStr).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

/**
 * Generates the complete season schedule from builder inputs.
 *
 * Starts at startDate and advances 7 calendar days per entry, counting
 * non-skip entries until totalBowlingWeeks is reached. Completed weeks are
 * interleaved as locked (immutable) entries; admin-marked skip dates become
 * skip entries; all other dates become upcoming.
 *
 * @param startDate          - YYYY-MM-DD first bowling night of the season
 * @param totalBowlingWeeks  - Target number of bowling (non-skip) weeks
 * @param skipDates          - Map of YYYY-MM-DD → admin note for holiday weeks
 * @param completedWeeks     - Existing Firestore documents with status 'completed'
 * @param duesOffDates       - Set of YYYY-MM-DD dates admin has unchecked "Dues?" for
 * @param specialEvents      - Map of YYYY-MM-DD → admin-selected playoff/championship tag
 * @param notesOverrides     - Map of YYYY-MM-DD → admin-entered free-text note
 * @param publicOffDates     - Set of YYYY-MM-DD dates admin has unchecked "Public?" for
 * @returns Ordered list of GeneratedEntry objects covering the full season
 */
function buildSchedule(
  startDate: string,
  totalBowlingWeeks: number,
  skipDates: Record<string, string>,
  completedWeeks: ScheduleWeek[],
  duesOffDates: Set<string>,
  specialEvents: Record<string, ScheduleWeekEvent>,
  notesOverrides: Record<string, string>,
  publicOffDates: Set<string>,
): GeneratedEntry[] {
  if (!startDate || totalBowlingWeeks < 1) return []

  // Build a lookup for completed weeks so we can preserve their week numbers
  const completedMap = new Map(completedWeeks.map(w => [w.date, w]))

  const entries: GeneratedEntry[] = []
  let bowlingCount = 0
  // Hard cap prevents an infinite loop if admin enters an absurd skip count
  const maxEntries = totalBowlingWeeks + 52

  let current = parseLocal(startDate)

  while (bowlingCount < totalBowlingWeeks && entries.length < maxEntries) {
    const dateStr = toDateStr(current)
    const completed = completedMap.get(dateStr)

    if (completed) {
      // Completed week: locked, preserves the existing Firestore week number,
      // dues flag, event tag, note, and visibility — the builder never
      // rewrites completed documents, so these are display-only.
      bowlingCount++
      entries.push({
        date: dateStr,
        week: completed.week,
        status: 'completed',
        skipReason: '',
        locked: true,
        duesOwed: completed.duesOwed ?? true,
        specialEvent: completed.specialEvent ?? null,
        notes: completed.notes ?? '',
        visible: completed.visible ?? true,
      })
    } else if (dateStr in skipDates) {
      // Admin-marked holiday: doesn't consume a bowling week slot, no bowling
      // happens so dues are never owed and no playoff/championship tag applies
      entries.push({
        date: dateStr,
        week: null,
        status: 'skip',
        skipReason: skipDates[dateStr],
        locked: false,
        duesOwed: false,
        specialEvent: null,
        notes: notesOverrides[dateStr] ?? '',
        visible: !publicOffDates.has(dateStr),
      })
    } else {
      // Regular bowling week — dues owed by default, admin can uncheck;
      // no playoff/championship tag unless admin selects one
      bowlingCount++
      entries.push({
        date: dateStr,
        week: bowlingCount,
        status: 'upcoming',
        skipReason: '',
        locked: false,
        duesOwed: !duesOffDates.has(dateStr),
        specialEvent: specialEvents[dateStr] ?? null,
        notes: notesOverrides[dateStr] ?? '',
        visible: !publicOffDates.has(dateStr),
      })
    }

    // Advance exactly 7 days using local-time arithmetic to avoid DST edge cases
    current = new Date(
      current.getFullYear(),
      current.getMonth(),
      current.getDate() + 7,
    )
  }

  return entries
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface SeasonScheduleBuilderProps {
  /** Season year string this schedule belongs to (e.g. '2025-2026') */
  seasonYear: string
  /** Current scheduleWeeks documents for this season, if any exist */
  existingWeeks: ScheduleWeek[]
  /**
   * Total bowling weeks from leagueConfig, if available.
   * Used as the initial totalWeeks value when editing an existing schedule.
   */
  configuredTotalWeeks?: number
  /** Called after a successful Firestore batch write */
  onSaved: () => void
  /** Called when the user dismisses the builder without saving */
  onCancel: () => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Inline schedule builder for creating or editing a season's week-by-week
 * schedule.
 *
 * Parent must pass `key={seasonYear}` so React remounts (and resets all state)
 * whenever the admin switches to a different season in the dropdown.
 *
 * @param seasonYear             - Season this schedule belongs to
 * @param existingWeeks          - Current Firestore scheduleWeeks for this season
 * @param configuredTotalWeeks   - leagueConfig.totalWeeks, when available
 * @param onSaved                - Callback after successful save
 * @param onCancel               - Callback when user cancels
 */
function SeasonScheduleBuilder({
  seasonYear,
  existingWeeks,
  configuredTotalWeeks,
  onSaved,
  onCancel,
}: SeasonScheduleBuilderProps) {
  // Completed weeks are locked — we read their data but never write over them
  const completedWeeks = useMemo(
    () => existingWeeks.filter(w => w.status === 'completed'),
    [existingWeeks],
  )

  // ---------------------------------------------------------------------------
  // State — lazy initializers run once on mount (parent key={seasonYear} ensures
  // remount when season changes, so these automatically reset with new data)
  // ---------------------------------------------------------------------------

  const [startDate, setStartDate] = useState<string>(
    () => existingWeeks[0]?.date ?? '',
  )

  const [totalWeeks, setTotalWeeks] = useState<number>(() => {
    // Priority: explicit leagueConfig value → count from existing data → default
    if (configuredTotalWeeks && configuredTotalWeeks > 0) return configuredTotalWeeks
    const nonNull = existingWeeks.filter(w => w.week !== null).length
    return nonNull > 0 ? nonNull : 32
  })

  const [skipDates, setSkipDates] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      existingWeeks
        .filter(w => w.status === 'skip')
        .map(w => [w.date, w.skipReason ?? '']),
    ),
  )

  // Dates where the admin has unchecked "Dues?" for an upcoming week. Only
  // exceptions are tracked so every new/unmarked date defaults to checked.
  const [duesOffDates, setDuesOffDates] = useState<Set<string>>(() => new Set(
    existingWeeks
      .filter(w => w.status === 'upcoming' && w.duesOwed === false)
      .map(w => w.date),
  ))

  // Admin-selected playoff/championship tag per upcoming date. Only dates with
  // a tag are stored — everything else defaults to "no tag".
  const [specialEvents, setSpecialEvents] = useState<Record<string, ScheduleWeekEvent>>(() =>
    Object.fromEntries(
      existingWeeks
        .filter((w): w is ScheduleWeek & { specialEvent: ScheduleWeekEvent } => w.status === 'upcoming' && !!w.specialEvent)
        .map(w => [w.date, w.specialEvent]),
    ),
  )

  // Free-text note per non-completed date. Only dates with a note are stored;
  // everything else defaults to empty (no note).
  const [notesOverrides, setNotesOverrides] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      existingWeeks
        .filter(w => w.status !== 'completed' && w.notes)
        .map(w => [w.date, w.notes as string]),
    ),
  )

  // Dates where the admin has unchecked "Public?". Only exceptions are
  // tracked so every new/unmarked date defaults to checked (visible).
  const [publicOffDates, setPublicOffDates] = useState<Set<string>>(() => new Set(
    existingWeeks
      .filter(w => w.status !== 'completed' && w.visible === false)
      .map(w => w.date),
  ))

  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  // ---------------------------------------------------------------------------
  // Derived values
  // ---------------------------------------------------------------------------

  const schedule = useMemo(
    () => buildSchedule(startDate, totalWeeks, skipDates, completedWeeks, duesOffDates, specialEvents, notesOverrides, publicOffDates),
    [startDate, totalWeeks, skipDates, completedWeeks, duesOffDates, specialEvents, notesOverrides, publicOffDates],
  )

  const bowlingWeekCount = schedule.filter(e => e.week !== null).length
  const isValid = startDate.length > 0 && totalWeeks > 0
  const isEditing = existingWeeks.length > 0
  const hasCompleted = completedWeeks.length > 0

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  /**
   * Toggles a date as a holiday/skip.
   * Adding a skip removes the date from the bowling sequence and appends a new
   * date at the end to maintain the total bowling-week count.
   * Completed weeks cannot be toggled — this function is never called for them.
   *
   * @param date - YYYY-MM-DD date to toggle
   */
  function toggleSkip(date: string) {
    setSkipDates(prev => {
      if (date in prev) {
        const next = { ...prev }
        delete next[date]
        return next
      }
      return { ...prev, [date]: '' }
    })
  }

  /**
   * Updates the holiday note for a skip date.
   *
   * @param date   - YYYY-MM-DD skip date
   * @param reason - Human-readable reason (e.g. "Thanksgiving Break")
   */
  function updateReason(date: string, reason: string) {
    setSkipDates(prev => ({ ...prev, [date]: reason }))
  }

  /**
   * Toggles whether teams owe weekly dues for an upcoming date.
   * Not called for skip rows (always false) or completed rows (read-only,
   * never rewritten by this builder).
   *
   * @param date - YYYY-MM-DD upcoming date to toggle
   */
  function toggleDues(date: string) {
    setDuesOffDates(prev => {
      const next = new Set(prev)
      if (next.has(date)) next.delete(date)
      else next.add(date)
      return next
    })
  }

  /**
   * Sets or clears the playoff/championship tag for an upcoming date.
   * Not called for skip rows (always null) or completed rows (read-only,
   * never rewritten by this builder).
   *
   * @param date  - YYYY-MM-DD upcoming date to tag
   * @param value - Selected `ScheduleWeekEvent`, or '' to clear the tag
   */
  function updateSpecialEvent(date: string, value: string) {
    setSpecialEvents(prev => {
      if (!value) {
        const next = { ...prev }
        delete next[date]
        return next
      }
      return { ...prev, [date]: value as ScheduleWeekEvent }
    })
  }

  /**
   * Updates the free-text note for a non-completed date. Committed to
   * Firestore only when "Save Schedule" is clicked, like every other field
   * in this table — typing here never writes on its own.
   *
   * @param date - YYYY-MM-DD date to update
   * @param note - New note text (may be empty)
   */
  function updateNotes(date: string, note: string) {
    setNotesOverrides(prev => ({ ...prev, [date]: note }))
  }

  /**
   * Toggles public visibility for a non-completed date.
   * Not called for completed rows (read-only, never rewritten by this
   * builder) — completed weeks' visibility is adjusted via the bulk
   * "Show all" / "Hide weeks" actions on the non-editing Season Details view.
   *
   * @param date - YYYY-MM-DD date to toggle
   */
  function togglePublic(date: string) {
    setPublicOffDates(prev => {
      const next = new Set(prev)
      if (next.has(date)) next.delete(date)
      else next.add(date)
      return next
    })
  }

  /**
   * Batch-writes the generated schedule to Firestore.
   *
   * - Skips completed weeks (never overwritten).
   * - Writes all upcoming and skip entries.
   * - Deletes any orphaned upcoming/skip documents from a previous schedule
   *   that are no longer present in the new one.
   */
  async function handleSave() {
    if (!isValid || schedule.length === 0) return

    setSaving(true)
    setSaveError('')

    try {
      const completedDates = new Set(completedWeeks.map(w => w.date))
      const newDates = new Set(schedule.map(e => e.date))
      const batch = writeBatch(db)
      if (isLocalAdminBypass()) {
        await localAdminWrite({
          operation: 'save-schedule',
          seasonYear,
          totalWeeks,
          writes: schedule
            .filter(entry => !completedDates.has(entry.date))
            .map(entry => ({
              date: entry.date,
              data: {
                seasonYear,
                date: entry.date,
                week: entry.week,
                status: entry.status === 'skip' ? 'skip' : 'upcoming',
                skipReason: entry.status === 'skip' ? (entry.skipReason || null) : null,
                positionRound: false,
                visible: entry.visible,
                notes: entry.notes.trim() || null,
                duesOwed: entry.duesOwed,
                specialEvent: entry.specialEvent,
              },
            })),
          deleteDates: existingWeeks
            .filter(existing => !newDates.has(existing.date))
            .map(existing => existing.date),
        })
        onSaved()
        return
      }
      // Keep the season configuration in sync with an admin-corrected total.
      // This is a merge so the rest of the league's settings are retained.
      batch.set(doc(db, 'leagueConfig', seasonYear), { totalWeeks }, { merge: true })

      // Write upcoming and skip entries
      for (const entry of schedule) {
        if (completedDates.has(entry.date)) continue
        batch.set(doc(db, 'scheduleWeeks', entry.date), {
          seasonYear,
          date: entry.date,
          week: entry.week,
          status: entry.status === 'skip' ? 'skip' : 'upcoming',
          skipReason: entry.status === 'skip' ? (entry.skipReason || null) : null,
          positionRound: false,
          visible: entry.visible,
          notes: entry.notes.trim() || null,
          duesOwed: entry.duesOwed,
          specialEvent: entry.specialEvent,
        })
      }

      // Remove orphaned upcoming/skip entries no longer in the new schedule
      // (e.g. the last week was removed by reducing totalWeeks)
      for (const existing of existingWeeks) {
        if (!newDates.has(existing.date)) {
          batch.delete(doc(db, 'scheduleWeeks', existing.date))
        }
      }

      await batch.commit()
      onSaved()
    } catch (err) {
      setSaveError('Failed to save schedule. Please try again.')
      console.error('[SeasonScheduleBuilder] batch write error:', err)
    } finally {
      setSaving(false)
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div>
      {/* --- Input fields --------------------------------------------------- */}
      <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', marginBottom: '1.5rem', alignItems: 'flex-end' }}>
        <div style={{ flex: '1', minWidth: '180px' }}>
          <label className="admin-label" htmlFor="sched-start-date">
            Season Start Date
          </label>
          <input
            id="sched-start-date"
            type="date"
            className="admin-input"
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
            disabled={hasCompleted}
            title={hasCompleted ? 'Start date cannot be changed after weeks have been completed' : undefined}
          />
          {hasCompleted && (
            <p className="admin-form-hint" style={{ marginTop: '0.25rem', fontSize: '0.75rem' }}>
              Locked — completed weeks exist
            </p>
          )}
        </div>
        <div style={{ flex: '1', minWidth: '140px' }}>
          <label className="admin-label" htmlFor="sched-total-weeks">
            Total Bowling Weeks
          </label>
          <input
            id="sched-total-weeks"
            type="number"
            className="admin-input"
            value={totalWeeks}
            min={1}
            max={52}
            onChange={e =>
              setTotalWeeks(Math.max(1, Math.min(52, parseInt(e.target.value, 10) || 1)))
            }
          />
        </div>
      </div>

      {/* --- Schedule preview ----------------------------------------------- */}
      {isValid ? (
        <>
          {/* Stat chips */}
          <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
            {[
              { value: bowlingWeekCount, label: 'Bowling Weeks' },
              { value: schedule.length, label: 'Calendar Entries' },
            ].map(stat => (
              <div
                key={stat.label}
                style={{
                  background: 'rgba(201,168,76,0.07)',
                  border: '1px solid rgba(201,168,76,0.18)',
                  borderRadius: '8px',
                  padding: '0.5rem 1rem',
                  minWidth: '76px',
                }}
              >
                <div style={{ fontSize: '1.35rem', fontWeight: 700, color: '#c9a84c', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                  {stat.value}
                </div>
                <div style={{ fontSize: '0.63rem', color: 'rgba(255,255,255,0.38)', marginTop: '0.28rem', textTransform: 'uppercase', letterSpacing: '0.09em' }}>
                  {stat.label}
                </div>
              </div>
            ))}
            <p className="admin-form-hint" style={{ margin: 'auto 0', fontSize: '0.78rem' }}>
              Check "Skip" on any row — the season extends by one date at the end to compensate.
            </p>
          </div>

          <div style={{ overflowX: 'auto', marginBottom: '1.25rem' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr>
                  {['Wk', 'Date', 'Skip?', 'Holiday Note', 'Dues?', 'Event', 'Notes', 'Public?'].map(col => (
                    <th
                      key={col}
                      style={{
                        padding: '0.4rem 0.875rem',
                        fontWeight: 600,
                        fontSize: '0.62rem',
                        letterSpacing: '0.12em',
                        textTransform: 'uppercase',
                        color: 'rgba(255,255,255,0.3)',
                        borderBottom: '1px solid rgba(255,255,255,0.07)',
                        textAlign: 'left',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {schedule.map(entry => {
                  const isSkip = entry.status === 'skip'
                  const isCompleted = entry.status === 'completed'
                  return (
                    <tr
                      key={entry.date}
                      style={{
                        borderBottom: '1px solid rgba(255,255,255,0.045)',
                        borderLeft: isCompleted
                          ? '3px solid #166534'
                          : isSkip
                          ? '3px solid #374151'
                          : '3px solid transparent',
                        backgroundColor: isCompleted
                          ? 'rgba(74,222,128,0.04)'
                          : isSkip
                          ? 'rgba(0,0,0,0.25)'
                          : undefined,
                        opacity: isSkip ? 0.6 : 1,
                      }}
                    >
                      {/* Week number — gold for bowling weeks */}
                      <td style={{
                        padding: '0.6rem 0.875rem',
                        verticalAlign: 'middle',
                        width: '3.5rem',
                        fontSize: entry.week !== null ? '1rem' : '0.85rem',
                        fontWeight: entry.week !== null ? 700 : 400,
                        color: entry.week !== null ? '#c9a84c' : 'rgba(255,255,255,0.2)',
                        fontVariantNumeric: 'tabular-nums',
                      }}>
                        {entry.week ?? '—'}
                      </td>

                      {/* Calendar date */}
                      <td style={{
                        padding: '0.6rem 0.875rem',
                        verticalAlign: 'middle',
                        color: isSkip ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.82)',
                        fontStyle: isSkip ? 'italic' : undefined,
                      }}>
                        {formatDate(entry.date)}
                      </td>

                      {/* Skip toggle — locked rows show a dot+label */}
                      <td style={{ padding: '0.6rem 0.875rem', verticalAlign: 'middle', width: '5rem' }}>
                        {entry.locked ? (
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                            fontSize: '0.68rem',
                            fontWeight: 600,
                            letterSpacing: '0.08em',
                            textTransform: 'uppercase',
                            color: isCompleted ? '#4ade80' : '#6b7280',
                          }}>
                            <span style={{
                              width: '5px', height: '5px', borderRadius: '50%',
                              backgroundColor: isCompleted ? '#4ade80' : '#6b7280',
                              flexShrink: 0,
                            }} />
                            {isCompleted ? 'Bowled' : 'Skip'}
                          </span>
                        ) : (
                          <input
                            type="checkbox"
                            checked={isSkip}
                            onChange={() => toggleSkip(entry.date)}
                            style={{ cursor: 'pointer', width: '1rem', height: '1rem', accentColor: '#c9a84c' }}
                            aria-label={`Mark ${formatDate(entry.date)} as a holiday or skip week`}
                          />
                        )}
                      </td>

                      {/* Holiday note */}
                      <td style={{ padding: '0.6rem 0.875rem', verticalAlign: 'middle' }}>
                        {isSkip && !entry.locked ? (
                          <input
                            type="text"
                            className="admin-input"
                            placeholder="e.g. Thanksgiving Break"
                            value={entry.skipReason}
                            onChange={e => updateReason(entry.date, e.target.value)}
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.825rem', width: '100%', maxWidth: '240px' }}
                          />
                        ) : entry.skipReason ? (
                          <span style={{ color: entry.locked ? 'rgba(255,255,255,0.35)' : undefined }}>
                            {entry.skipReason}
                          </span>
                        ) : (
                          <span style={{ color: 'rgba(255,255,255,0.12)' }}>—</span>
                        )}
                      </td>

                      {/* Dues toggle — no bowling on skip weeks means no dues;
                          completed weeks are read-only (never rewritten) */}
                      <td style={{ padding: '0.6rem 0.875rem', verticalAlign: 'middle', width: '5rem' }}>
                        {isSkip ? (
                          <span style={{ color: 'rgba(255,255,255,0.12)' }}>—</span>
                        ) : entry.locked ? (
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                            fontSize: '0.68rem',
                            fontWeight: 600,
                            letterSpacing: '0.08em',
                            textTransform: 'uppercase',
                            color: entry.duesOwed ? '#4ade80' : '#6b7280',
                          }}>
                            <span style={{
                              width: '5px', height: '5px', borderRadius: '50%',
                              backgroundColor: entry.duesOwed ? '#4ade80' : '#6b7280',
                              flexShrink: 0,
                            }} />
                            {entry.duesOwed ? 'Owed' : 'Waived'}
                          </span>
                        ) : (
                          <input
                            type="checkbox"
                            checked={entry.duesOwed}
                            onChange={() => toggleDues(entry.date)}
                            style={{ cursor: 'pointer', width: '1rem', height: '1rem', accentColor: '#c9a84c' }}
                            aria-label={`Dues owed for ${formatDate(entry.date)}`}
                          />
                        )}
                      </td>

                      {/* Playoff/championship tag — skip rows never get one;
                          completed rows are read-only (never rewritten) */}
                      <td style={{ padding: '0.6rem 0.875rem', verticalAlign: 'middle', width: '9rem' }}>
                        {isSkip ? (
                          <span style={{ color: 'rgba(255,255,255,0.12)' }}>—</span>
                        ) : entry.locked ? (
                          entry.specialEvent ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.72rem', color: 'rgba(255,255,255,0.5)' }}>
                              <ScheduleEventBadge event={entry.specialEvent} size={14} />
                              {SCHEDULE_EVENT_CONFIG[entry.specialEvent].label}
                            </span>
                          ) : (
                            <span style={{ color: 'rgba(255,255,255,0.12)' }}>—</span>
                          )
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            {entry.specialEvent && <ScheduleEventBadge event={entry.specialEvent} size={14} />}
                            <select
                              className="admin-input"
                              value={entry.specialEvent ?? ''}
                              onChange={e => updateSpecialEvent(entry.date, e.target.value)}
                              style={{ padding: '0.25rem 0.4rem', fontSize: '0.75rem', width: '100%' }}
                              aria-label={`Playoff/championship tag for ${formatDate(entry.date)}`}
                            >
                              <option value="">— None —</option>
                              {SCHEDULE_EVENT_OPTIONS.map(option => (
                                <option key={option} value={option}>{SCHEDULE_EVENT_CONFIG[option].label}</option>
                              ))}
                            </select>
                          </div>
                        )}
                      </td>

                      {/* Free-text note — completed rows are read-only (never rewritten) */}
                      <td style={{ padding: '0.6rem 0.875rem', verticalAlign: 'middle', minWidth: '160px' }}>
                        {entry.locked ? (
                          entry.notes ? (
                            <span style={{ color: 'rgba(255,255,255,0.5)', whiteSpace: 'pre-line' }}>{entry.notes}</span>
                          ) : (
                            <span style={{ color: 'rgba(255,255,255,0.12)' }}>—</span>
                          )
                        ) : (
                          <textarea
                            className="admin-input"
                            placeholder="Add a note…"
                            rows={1}
                            value={entry.notes}
                            onChange={e => updateNotes(entry.date, e.target.value)}
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', width: '100%', resize: 'vertical', fontFamily: 'inherit' }}
                            aria-label={`Note for ${formatDate(entry.date)}`}
                          />
                        )}
                      </td>

                      {/* Public toggle — completed weeks are adjusted via the bulk
                          actions on the non-editing view instead (read-only here) */}
                      <td style={{ padding: '0.6rem 0.875rem', verticalAlign: 'middle', width: '5rem' }}>
                        {entry.locked ? (
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                            fontSize: '0.68rem',
                            fontWeight: 600,
                            letterSpacing: '0.08em',
                            textTransform: 'uppercase',
                            color: entry.visible ? '#4ade80' : '#6b7280',
                          }}>
                            <span style={{
                              width: '5px', height: '5px', borderRadius: '50%',
                              backgroundColor: entry.visible ? '#4ade80' : '#6b7280',
                              flexShrink: 0,
                            }} />
                            {entry.visible ? 'Visible' : 'Hidden'}
                          </span>
                        ) : (
                          <input
                            type="checkbox"
                            checked={entry.visible}
                            onChange={() => togglePublic(entry.date)}
                            style={{ cursor: 'pointer', width: '1rem', height: '1rem', accentColor: '#c9a84c' }}
                            aria-label={`Public visibility for ${formatDate(entry.date)}`}
                          />
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <p className="admin-form-hint" style={{ marginBottom: '1rem' }}>
          Enter a start date and total weeks above to preview the schedule.
        </p>
      )}

      {/* --- Action buttons ------------------------------------------------- */}
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
        <button
          type="button"
          className="admin-btn admin-btn-primary"
          onClick={handleSave}
          disabled={saving || !isValid || schedule.length === 0}
        >
          {saving ? 'Saving…' : isEditing ? 'Save Changes' : 'Save Schedule'}
        </button>
        <button
          type="button"
          className="admin-btn"
          onClick={onCancel}
          disabled={saving}
        >
          Cancel
        </button>
        {saveError && (
          <span className="admin-error-msg" style={{ marginLeft: '0.5rem' }}>
            {saveError}
          </span>
        )}
      </div>
    </div>
  )
}

export default SeasonScheduleBuilder
