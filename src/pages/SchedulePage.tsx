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

import { useEffect, useMemo, useState } from 'react'
import { useScheduleWeeks, useLeagueConfig } from '../hooks'
import WeekMatchupsModal from '../components/WeekMatchupsModal'
import StandingsPdfModal from '../components/StandingsPdfModal'
import SeasonPlaceholder from '../components/SeasonPlaceholder'
import ScheduleEventBadge from '../components/ScheduleEventBadge'
import { useSeasonYear, useSeasonStatus } from '../context/SeasonContext'
import { getStandingsPdfId } from '../utils/weeklyStandingsPdf'
import { isScheduleWeekVisible } from '../utils/weekVisibility'
import type { ScheduleWeek } from '../types'
import './SchedulePage.css'

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

  /* Skip-week reason tooltip: shown on hover (desktop) or tap (mobile/keyboard).
     Tracks the "YYYY-MM-DD" of the currently open tooltip, or null if closed. */
  const [openSkipDate, setOpenSkipDate] = useState<string | null>(null)

  /* Dismiss an open tap-triggered tooltip on the next tap anywhere else. */
  useEffect(() => {
    if (!openSkipDate) return
    const closeTooltip = () => setOpenSkipDate(null)
    document.addEventListener('click', closeTooltip)
    return () => document.removeEventListener('click', closeTooltip)
  }, [openSkipDate])

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
          const isSkipWeek = entry && entry.status === 'skip'
          const skipReason = entry?.skipReason || 'No bowling this week'
          const tooltipOpen = isSkipWeek && openSkipDate === dateStr

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
              statusClass = 'cal-cell--skip'
            }
          }

          /* Skip cells toggle the tap tooltip; play cells open the matchups modal. */
          const toggleSkipTooltip = () =>
            setOpenSkipDate(prev => (prev === dateStr ? null : dateStr))

          return (
            <div
              key={i}
              className={`cal-cell ${statusClass} ${isToday ? 'cal-cell--today' : ''} ${isPlayWeek ? 'cal-cell--clickable' : ''}`}
              title={isPlayWeek ? title || undefined : undefined}
              onClick={e => {
                if (isPlayWeek) { onEntryClick(entry); return }
                if (isSkipWeek) { e.stopPropagation(); toggleSkipTooltip() }
              }}
              onMouseEnter={() => isSkipWeek && setOpenSkipDate(dateStr)}
              onMouseLeave={() => isSkipWeek && setOpenSkipDate(prev => (prev === dateStr ? null : prev))}
              onFocus={() => isSkipWeek && setOpenSkipDate(dateStr)}
              onBlur={() => isSkipWeek && setOpenSkipDate(prev => (prev === dateStr ? null : prev))}
              role={isPlayWeek || isSkipWeek ? 'button' : undefined}
              tabIndex={isPlayWeek || isSkipWeek ? 0 : undefined}
              aria-label={isSkipWeek ? `No bowling — ${skipReason}` : undefined}
              onKeyDown={e => {
                if (isPlayWeek && (e.key === 'Enter' || e.key === ' ')) {
                  onEntryClick(entry)
                } else if (isSkipWeek) {
                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleSkipTooltip() }
                  if (e.key === 'Escape') setOpenSkipDate(null)
                }
              }}
            >
              <span className="cal-day-num">{day}</span>
              {isPlayWeek && entry.week != null && (
                <span
                  className={`cal-week-num cal-week-num--${entry.status}`}
                  aria-hidden="true"
                >
                  [{entry.week}]
                </span>
              )}
              {isPlayWeek && entry.specialEvent && (
                <ScheduleEventBadge event={entry.specialEvent} size={13} className="cal-event-badge" />
              )}
              {isSkipWeek && <span className="cal-skip-x" aria-hidden="true" />}
              {tooltipOpen && (
                <div
                  className="cal-skip-tooltip"
                  role="tooltip"
                  onClick={e => e.stopPropagation()}
                >
                  {skipReason}
                </div>
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
  const SEASON_YEAR = useSeasonYear()
  const { seasonActive, upcomingSeasonYear, loading: seasonStatusLoading } = useSeasonStatus()
  const [selectedWeek, setSelectedWeek] = useState<ScheduleWeek | null>(null)
  const [pdfWeek, setPdfWeek] = useState<number | null>(null)
  /* Dues tooltip: shown on hover (desktop) or tap/keyboard (mobile), one row at a
     time. Tracks the "YYYY-MM-DD" of the currently open tooltip, or null if closed. */
  const [openDuesDate, setOpenDuesDate] = useState<string | null>(null)
  /* Mobile-only note reveal: the Notes column is hidden below 768px (no room),
     so its content is reachable via a small tap-to-expand button in the Date
     column instead. Tracks the "YYYY-MM-DD" of the currently expanded row. */
  const [openInfoDate, setOpenInfoDate] = useState<string | null>(null)

  // Between seasons, preview the upcoming season's schedule (once staged via
  // admin Create Season + Season Details) instead of the just-finished season's.
  // No fallback to SEASON_YEAR here — that would silently relabel the prior,
  // already-played season's schedule as an "upcoming" preview.
  const displaySeasonYear = seasonActive ? SEASON_YEAR : upcomingSeasonYear

  // Firestore subscription for all schedule weeks in the displayed season
  const { data: scheduleWeeks, loading } = useScheduleWeeks(displaySeasonYear ?? '')
  const { data: leagueConfig } = useLeagueConfig(displaySeasonYear ?? null)
  // Weekly dues owed per bowler and the active lineup size (excludes bench/sub-pool
  // roster additions — a team can carry extra bowlers, but only this many play and
  // owe dues each week). Both must be positive for the dues indicator to render.
  const duesPerBowler = leagueConfig?.lineage ?? null
  const duesLineupSize = leagueConfig?.bowlersPerTeam ?? null
  const showDues = !!duesPerBowler && duesPerBowler > 0 && !!duesLineupSize && duesLineupSize > 0

  /* Dismiss an open tap-triggered dues tooltip on the next tap anywhere else. */
  useEffect(() => {
    if (!openDuesDate) return
    const closeTooltip = () => setOpenDuesDate(null)
    document.addEventListener('click', closeTooltip)
    return () => document.removeEventListener('click', closeTooltip)
  }, [openDuesDate])

  /* Dismiss an open mobile note panel on the next tap anywhere else. */
  useEffect(() => {
    if (!openInfoDate) return
    const closePanel = () => setOpenInfoDate(null)
    document.addEventListener('click', closePanel)
    return () => document.removeEventListener('click', closePanel)
  }, [openInfoDate])

  const visibleScheduleWeeks = useMemo(
    () => scheduleWeeks.filter(isScheduleWeekVisible),
    [scheduleWeeks]
  )

  /* ── Map "YYYY-MM-DD" → ScheduleWeek (for calendar lookup) ─────────── */
  const bowlingDateMap = useMemo<Record<string, ScheduleWeek>>(() => {
    const map: Record<string, ScheduleWeek> = {}
    for (const entry of visibleScheduleWeeks) map[entry.date] = entry
    return map
  }, [visibleScheduleWeeks])

  /* ── Calendar month range: derived from the displayed season's own dates
     so this works for whichever season year is being shown, rather than a
     fixed range tied to one season. ─────────────────────────────────── */
  const calendarMonths = useMemo(() => {
    if (scheduleWeeks.length === 0) return []
    const dates = scheduleWeeks.map(w => w.date).sort()
    const [startYear, startMonth] = dates[0].split('-').map(Number)
    const [endYear, endMonth] = dates[dates.length - 1].split('-').map(Number)
    const months: { year: number; month: number }[] = []
    let y = startYear
    let m = startMonth - 1 // 0-indexed
    while (y < endYear || (y === endYear && m <= endMonth - 1)) {
      months.push({ year: y, month: m })
      m++
      if (m > 11) {
        m = 0
        y++
      }
    }
    return months
  }, [scheduleWeeks])

  /* ── Date formatter ─────────────────────────────────────────────────── */
  const formatDate = (dateStr: string) =>
    new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })

  // Between seasons with no upcoming season year set, or none staged yet — nothing to preview.
  if (!seasonStatusLoading && !seasonActive && (!upcomingSeasonYear || (!loading && scheduleWeeks.length === 0))) {
    return (
      <SeasonPlaceholder
        pageTitle="Schedule"
        whatYoullSee="you'll see the season calendar and week-by-week schedule table."
      />
    )
  }

  // Show loading state while Firestore data arrives
  if (loading || seasonStatusLoading) {
    return (
      <div className="schedule-page">
        <h2 className="section-title">Season Schedule</h2>
        <p className="schedule-subtitle">{displaySeasonYear ?? SEASON_YEAR} Season · Thursday Nights</p>
        <p className="loading-message">Loading schedule…</p>
      </div>
    )
  }

  // Past the guards above: seasonActive is true (displaySeasonYear = SEASON_YEAR), or
  // seasonActive is false with upcomingSeasonYear confirmed set (displaySeasonYear = it).
  // Either way this is a real season year string.
  const effectiveSeasonYear = displaySeasonYear as string

  return (
    <div className="schedule-page">
      <h2 className="section-title">Season Schedule</h2>
      <p className="schedule-subtitle">{effectiveSeasonYear} Season · Thursday Nights</p>
      {!seasonActive && (
        <p className="schedule-preview-banner">
          <strong>Between Seasons</strong> — previewing the {effectiveSeasonYear} schedule. Games haven't started yet, so every week below is still upcoming.
        </p>
      )}

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
                <th className="sch-col-action">Matchups</th>
              </tr>
            </thead>
            <tbody>
              {visibleScheduleWeeks.map((entry, idx) => {
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

                    {/* Date — skip reason repeats here (mobile-only) since the
                        Notes column is hidden below 768px */}
                    <td className="sch-col-date sch-date-cell">
                      <span className="sch-date-row">
                        <span className="sch-date-text">{formatDate(entry.date)}</span>
                        {/* Icon cluster pinned to the right of the row (margin-left: auto)
                            so the date stays left-aligned regardless of how many icons a
                            given week has. */}
                        <span className="sch-date-icons">
                        {!isSkip && entry.duesOwed !== false && showDues && entry.week != null && (
                          <span className="sch-dues-wrap">
                            <button
                              type="button"
                              className="sch-dues-badge"
                              aria-label={`Weekly dues for week ${entry.week}`}
                              aria-expanded={openDuesDate === entry.date}
                              onClick={e => {
                                e.stopPropagation()
                                setOpenDuesDate(prev => (prev === entry.date ? null : entry.date))
                              }}
                              onMouseEnter={() => setOpenDuesDate(entry.date)}
                              onMouseLeave={() => setOpenDuesDate(prev => (prev === entry.date ? null : prev))}
                              onFocus={() => setOpenDuesDate(entry.date)}
                              onBlur={() => setOpenDuesDate(prev => (prev === entry.date ? null : prev))}
                              onKeyDown={e => {
                                if (e.key === 'Escape') setOpenDuesDate(null)
                              }}
                            >
                              $
                            </button>
                            {openDuesDate === entry.date && (
                              <span className="sch-dues-note" role="status">
                                Each team owes ${(duesLineupSize as number) * (duesPerBowler as number)} for week {entry.week}, (${duesPerBowler} per bowler)
                              </span>
                            )}
                          </span>
                        )}
                        {/* Mobile-only: Notes column (and its event badge) is hidden below
                            768px, so the trophy/crown stays visible here without a tap. */}
                        {entry.specialEvent && (
                          <ScheduleEventBadge event={entry.specialEvent} size={16} className="sch-event-badge-mobile" />
                        )}
                        {/* Skip rows already show their reason via the always-visible
                            element below, so only offer the trigger for content that
                            isn't already visible on this row. */}
                        {(entry.positionRound || entry.notes || (entry.skipReason && !isSkip)) && (
                          <button
                            type="button"
                            className="sch-note-trigger"
                            aria-label={`View notes for ${formatDate(entry.date)}`}
                            aria-expanded={openInfoDate === entry.date}
                            onClick={e => {
                              e.stopPropagation()
                              setOpenInfoDate(prev => (prev === entry.date ? null : entry.date))
                            }}
                          >
                            <svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden="true">
                              <rect x="3.5" y="4.5" width="17" height="15" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" />
                              <line x1="7.5" y1="9.5" x2="16.5" y2="9.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                              <line x1="7.5" y1="13" x2="16.5" y2="13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                              <line x1="7.5" y1="16.5" x2="13" y2="16.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                            </svg>
                          </button>
                        )}
                        </span>
                      </span>
                      {isSkip && entry.skipReason && (
                        <span className="sch-skip-reason-mobile">{entry.skipReason}</span>
                      )}
                      {openInfoDate === entry.date && (
                        <div className="sch-info-card sch-info-card--mobile">
                          <div className="sch-info-text">
                            {entry.positionRound && (
                              <span className="sch-position-round-badge">Position Round</span>
                            )}
                            {entry.skipReason && !isSkip && (
                              <p className="sch-info-line sch-info-line--skip">{entry.skipReason}</p>
                            )}
                            {entry.notes && (
                              <p className="sch-info-line sch-info-line--notes">{entry.notes}</p>
                            )}
                          </div>
                        </div>
                      )}
                    </td>

                    {/* Notes: playoff/championship badge, position round badge, admin note, and
                        skip reason all grouped into a single card instead of separate floating
                        elements, so a row with several of these reads as one unit. The event
                        badge sits to the left of the text column instead of on its own line. */}
                    <td className="sch-col-notes sch-notes-cell">
                      {(entry.specialEvent || entry.positionRound || entry.skipReason || entry.notes) && (
                        <div className="sch-info-card">
                          {entry.specialEvent && (
                            <ScheduleEventBadge event={entry.specialEvent} size={22} className="sch-event-badge" />
                          )}
                          <div className="sch-info-text">
                            {entry.positionRound && (
                              <span className="sch-position-round-badge">Position Round</span>
                            )}
                            {entry.skipReason && (
                              <p className="sch-info-line sch-info-line--skip">{entry.skipReason}</p>
                            )}
                            {entry.notes && (
                              <p className="sch-info-line sch-info-line--notes">{entry.notes}</p>
                            )}
                          </div>
                        </div>
                      )}
                    </td>

                    {/* Action buttons: View Matchups + optional Standings PDF */}
                    <td className="sch-col-action">
                      {!isSkip && (
                        <div className="sch-action-group">
                          <button
                            className={`sch-view-btn sch-view-btn--${entry.status}`}
                            onClick={() => setSelectedWeek(entry)}
                            aria-label={`View matchups for week ${entry.week}`}
                          >
                            View Matchups
                          </button>
                          {entry.status === 'completed' && entry.week != null && getStandingsPdfId(entry.week) && (
                            <button
                              className="standings-pdf-btn"
                              onClick={() => setPdfWeek(entry.week ?? null)}
                              aria-label={`View standings PDF for Week ${entry.week}`}
                            >
                              <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                                <path d="M14 4.5V14a2 2 0 01-2 2H4a2 2 0 01-2-2V2a2 2 0 012-2h5.5L14 4.5zm-3 0A1.5 1.5 0 019.5 3V1H4a1 1 0 00-1 1v12a1 1 0 001 1h8a1 1 0 001-1V4.5h-2z"/>
                              </svg>
                              PDF
                            </button>
                          )}
                        </div>
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
        seasonYear={effectiveSeasonYear}
        onClose={() => setSelectedWeek(null)}
      />

      {/* ── Standings PDF viewer ──────────────────────────────────────── */}
      <StandingsPdfModal weekNum={pdfWeek} onClose={() => setPdfWeek(null)} />
    </div>
  )
}

export default SchedulePage
