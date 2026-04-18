/**
 * @file SchedulePage.tsx
 * @module pages
 *
 * Full season schedule with monthly mini-calendars and a week-by-week table.
 * Data is loaded from Firestore via `useScheduleWeeks` — no static JSON import.
 *
 * Layout:
 *  1. Monthly mini-calendars (Sept 2025 – May 2026) showing bowling dates
 *  2. Schedule table listing every week, matchup pairs, events, skip reasons,
 *     and a "Position Round" badge for position-round weeks
 *  3. "View Matchups" button per play week opens a modal
 */

import { useMemo, useState } from 'react'
import { useScheduleWeeks } from '../hooks'
import WeekMatchupsModal from '../components/WeekMatchupsModal'
import type { ScheduleWeek } from '../types'
import './SchedulePage.css'

/** Season year constant — update when the season rolls over */
const SEASON_YEAR = '2025-2026'

/* ── Month-calendar sub-component ───────────────────────────────────────── */

const DAY_HEADERS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

interface MonthCalendarProps {
  year: number
  /** 0-indexed month (0 = January) */
  month: number
  /** Map from "YYYY-MM-DD" to the ScheduleWeek for that date */
  bowlingDateMap: Record<string, ScheduleWeek>
  onEntryClick: (entry: ScheduleWeek) => void
}

/**
 * MonthCalendar — renders a single month grid with bowling-date indicators.
 *
 * @param year           - Full 4-digit year
 * @param month          - 0-indexed month number
 * @param bowlingDateMap - Pre-built date→ScheduleWeek lookup map
 * @param onEntryClick   - Callback when a play-week cell is activated
 */
function MonthCalendar({
  year,
  month,
  bowlingDateMap,
  onEntryClick,
}: MonthCalendarProps) {
  const firstDayOfWeek = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const monthName = new Date(year, month, 1).toLocaleDateString('en-US', {
    month: 'long',
  })
  const today = new Date().toISOString().slice(0, 10)

  /* Build flat cell array: null for padding slots, day number otherwise */
  const cells: (number | null)[] = [
    ...Array<null>(firstDayOfWeek).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  return (
    <div className="month-calendar">
      <h3 className="month-title">
        {monthName} {year}
      </h3>
      <div className="calendar-grid">
        {DAY_HEADERS.map(d => (
          <div key={d} className="cal-day-header">
            {d}
          </div>
        ))}
        {cells.map((day, i) => {
          if (day === null) {
            return <div key={i} className="cal-cell cal-cell--empty" />
          }

          const mm = String(month + 1).padStart(2, '0')
          const dd = String(day).padStart(2, '0')
          const dateStr = `${year}-${mm}-${dd}`
          const entry = bowlingDateMap[dateStr]
          const isToday = dateStr === today

          let statusClass = ''
          let title = ''
          const isPlayWeek = entry && entry.status !== 'skip'

          if (entry) {
            if (entry.status === 'completed') {
              statusClass = 'cal-cell--completed'
              title = `Week ${entry.week} — click to view`
            }
            if (entry.status === 'upcoming') {
              statusClass = 'cal-cell--upcoming'
              title = `Week ${entry.week} — upcoming`
            }
            if (entry.status === 'skip') {
              title = `No bowling — ${entry.skipReason}`
            }
          }

          return (
            <div
              key={i}
              className={`cal-cell ${statusClass} ${isToday ? 'cal-cell--today' : ''} ${isPlayWeek ? 'cal-cell--clickable' : ''}`}
              title={title || undefined}
              onClick={() => isPlayWeek && onEntryClick(entry)}
              role={isPlayWeek ? 'button' : undefined}
              tabIndex={isPlayWeek ? 0 : undefined}
              onKeyDown={e => {
                if ((e.key === 'Enter' || e.key === ' ') && isPlayWeek)
                  onEntryClick(entry)
              }}
            >
              <span className="cal-day-num">{day}</span>
              {isPlayWeek && (
                <span
                  className={`cal-dot cal-dot--${entry.status}`}
                  aria-hidden="true"
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   SCHEDULE PAGE
═══════════════════════════════════════════════════════════════════════════ */

/**
 * SchedulePage — top-level page component showing the full season calendar
 * and a sortable week-by-week schedule table.
 *
 * Data source: Firestore `scheduleWeeks` collection via `useScheduleWeeks`.
 * The `week` field (not the removed `dataWeek`) is used throughout.
 */
function SchedulePage() {
  const [selectedWeek, setSelectedWeek] = useState<ScheduleWeek | null>(null)

  // Firestore subscription for all schedule weeks in the current season
  const { data: scheduleWeeks, loading } = useScheduleWeeks(SEASON_YEAR)

  /* ── Map "YYYY-MM-DD" → ScheduleWeek (for calendar lookup) ─────────── */
  const bowlingDateMap = useMemo<Record<string, ScheduleWeek>>(() => {
    const map: Record<string, ScheduleWeek> = {}
    for (const entry of scheduleWeeks) map[entry.date] = entry
    return map
  }, [scheduleWeeks])

  /* ── Calendar month range: Sept 2025 – May 2026 ─────────────────────── */
  const calendarMonths = useMemo(() => {
    const months: { year: number; month: number }[] = []
    let y = 2025
    let m = 8 // September (0-indexed)
    while (y < 2026 || (y === 2026 && m <= 4)) {
      months.push({ year: y, month: m })
      m++
      if (m > 11) {
        m = 0
        y++
      }
    }
    return months
  }, [])

  /* ── Date formatter ─────────────────────────────────────────────────── */
  const formatDate = (dateStr: string) =>
    new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })

  // Show loading state while Firestore data arrives
  if (loading) {
    return (
      <div className="schedule-page">
        <h2 className="section-title">Season Schedule</h2>
        <p className="schedule-subtitle">2025 – 2026 Season · Thursday Nights</p>
        <p className="loading-message">Loading schedule…</p>
      </div>
    )
  }

  return (
    <div className="schedule-page">
      <h2 className="section-title">Season Schedule</h2>
      <p className="schedule-subtitle">2025 – 2026 Season · Thursday Nights</p>

      {/* ── Calendar legend ───────────────────────────────────────────── */}
      <div className="cal-legend">
        <span className="cal-legend-item">
          <span className="cal-dot cal-dot--completed" />
          Completed
        </span>
        <span className="cal-legend-item">
          <span className="cal-dot cal-dot--upcoming" />
          Upcoming
        </span>
      </div>

      {/* ── Monthly calendars ─────────────────────────────────────────── */}
      <section className="calendars-section" aria-label="Season calendar">
        <div className="calendars-grid">
          {calendarMonths.map(({ year, month }) => (
            <MonthCalendar
              key={`${year}-${month}`}
              year={year}
              month={month}
              bowlingDateMap={bowlingDateMap}
              onEntryClick={setSelectedWeek}
            />
          ))}
        </div>
      </section>

      {/* ── Schedule table ────────────────────────────────────────────── */}
      <section
        className="schedule-table-section"
        aria-label="Week-by-week schedule"
      >
        <div className="schedule-table-shell">
          <table className="schedule-table">
            <thead>
              <tr>
                <th className="sch-col-week">Week</th>
                <th className="sch-col-date">Date</th>
                <th className="sch-col-notes">Notes</th>
                <th className="sch-col-action"></th>
              </tr>
            </thead>
            <tbody>
              {scheduleWeeks.map((entry, idx) => {
                const isSkip = entry.status === 'skip'

                return (
                  <tr
                    key={entry.date}
                    id={
                      entry.week != null
                        ? `week-row-${entry.week}`
                        : `skip-row-${idx}`
                    }
                    className={`sch-row sch-row--${entry.status}`}
                  >
                    {/* Week badge */}
                    <td className="sch-col-week">
                      {isSkip ? (
                        <span className="sch-week-badge sch-week-badge--skip">
                          Off
                        </span>
                      ) : (
                        <span
                          className={`sch-week-badge sch-week-badge--${entry.status}`}
                        >
                          {entry.week}
                        </span>
                      )}
                    </td>

                    {/* Date */}
                    <td className="sch-col-date sch-date-cell">
                      {formatDate(entry.date)}
                    </td>

                    {/* Notes: position round badge, event label, or skip reason */}
                    <td className="sch-col-notes sch-notes-cell">
                      {/* Position round visual badge — shown when this week is
                          a position round where teams bowl in standings order */}
                      {entry.positionRound && (
                        <span className="sch-position-round-badge">
                          Position Round
                        </span>
                      )}
                      {entry.skipReason && (
                        <span className="sch-skip-reason">
                          {entry.skipReason}
                        </span>
                      )}
                      {entry.event && (
                        <span className="sch-event-label">{entry.event}</span>
                      )}
                    </td>

                    {/* Action button */}
                    <td className="sch-col-action">
                      {!isSkip && (
                        <button
                          className={`sch-view-btn sch-view-btn--${entry.status}`}
                          onClick={() => setSelectedWeek(entry)}
                          aria-label={`View matchups for week ${entry.week}`}
                        >
                          View Matchups
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Week matchups modal ───────────────────────────────────────── */}
      <WeekMatchupsModal
        weekEntry={selectedWeek}
        onClose={() => setSelectedWeek(null)}
      />
    </div>
  )
}

export default SchedulePage
