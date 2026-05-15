/**
 * @file WeekMatchupsModal.tsx
 * @component WeekMatchupsModal
 *
 * Overlay modal showing all matchup pairings for a selected schedule week.
 *
 * For completed weeks, displays team scores and win/loss state, and lets the
 * user drill into the full team breakdown via MatchupDetailModal.
 * For upcoming weeks, shows the scheduled team pairings without scores.
 *
 * Data is sourced from Firestore via `useMatchupDetails` and `useMatchups`
 * hooks — no static JSON imports.
 *
 * Field renames from the pre-migration schema:
 *  - `gameTotals.g1/g2/g3` → `game1Total/game2Total/game3Total` (TeamSummary)
 *  - `weekEntry.dataWeek`   → `weekEntry.week`  (ScheduleWeek schema change)
 *  - `team.id` (number)     → `team1Id`/`team2Id` + `leaguePalsId` (string)
 */

import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMatchupDetails, useMatchups, useTeams } from '../hooks'
import MatchupDetailModal from './MatchupDetailModal'
import StandingsPdfModal from './StandingsPdfModal'
import { getStandingsPdfId } from '../utils/weeklyStandingsPdf'
import type { ScheduleWeek, MatchupDetail } from '../types'
import './WeekMatchupsModal.css'

interface WeekMatchupsModalProps {
  /** The schedule week to display — null means the modal is closed. */
  weekEntry: ScheduleWeek | null
  onClose: () => void
}

/**
 * WeekMatchupsModal component.
 *
 * @param weekEntry - The schedule-week entry driving the modal content, or null
 *   when the modal should be hidden.
 * @param onClose   - Callback invoked when the modal requests dismissal.
 * @returns Modal JSX, or null when weekEntry is null.
 */
function WeekMatchupsModal({ weekEntry, onClose }: WeekMatchupsModalProps) {
  const navigate = useNavigate()
  const isOpen = weekEntry !== null

  /** Firestore document ID of the individual matchup the user drilled into. */
  const [detailMatchupId, setDetailMatchupId] = useState<string | null>(null)

  /** Week number for the standings PDF modal (null = closed). */
  const [pdfWeek, setPdfWeek] = useState<number | null>(null)

  // Fetch all matchup detail records (completed weeks scoreboard)
  const { data: matchupDetails } = useMatchupDetails('2025-2026')

  // Fetch lightweight matchup records for upcoming week pairings
  const { data: upcomingMatchups } = useMatchups('2025-2026')

  // Fetch teams to build a leaguePalsId → name lookup for upcoming pairings
  const { data: teams } = useTeams('2025-2026')

  /* ── Lock body scroll while open ────────────────────────────────────────── */
  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : 'unset'
    return () => { document.body.style.overflow = 'unset' }
  }, [isOpen])

  /* ── Escape key handler ──────────────────────────────────────────────────── */
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (detailMatchupId !== null) {
          setDetailMatchupId(null)
        } else if (isOpen) {
          onClose()
        }
      }
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen, onClose, detailMatchupId])

  /* ── Pre-build team name lookup: leaguePalsId → name ─────────────────────
     leaguePalsId replaces the old numeric `id` field on the Team interface.   */
  const teamNameMap = useMemo(() => {
    const map: Record<string, string> = {}
    for (const t of teams) map[t.leaguePalsId] = t.name
    return map
  }, [teams])

  /* ── Matchup data for the selected week ──────────────────────────────────
     ScheduleWeek.dataWeek was removed in the new schema; `week` is now the
     canonical week number on both ScheduleWeek and MatchupDetail.             */
  const completedMatchups = useMemo(() => {
    if (!weekEntry || weekEntry.status !== 'completed') return []
    return matchupDetails
      .filter(m => m.week === weekEntry.week)
      .sort((a, b) => a.team1.lane - b.team1.lane)
  }, [weekEntry, matchupDetails])

  const upcomingPairings = useMemo(() => {
    if (!weekEntry || weekEntry.status !== 'upcoming') return []
    return upcomingMatchups
      .filter(m => m.week === weekEntry.week)
      .sort((a, b) => a.team1Lane - b.team1Lane)
  }, [weekEntry, upcomingMatchups])

  /* ── Point calculation helpers (mirrors MatchupsPage logic) ──────────────── */

  /**
   * Returns 1/0.5/0 for win/tie/loss on a single game comparison.
   *
   * @param mine   - This team's score
   * @param theirs - Opponent's score
   */
  function calcPts(mine: number, theirs: number): number {
    if (mine > theirs) return 1
    if (mine === theirs) return 0.5
    return 0
  }

  /**
   * Calculates the 4-point breakdown for both teams in a completed matchup.
   * Uses `game1Total/game2Total/game3Total` (renamed from `gameTotals.g1/g2/g3`).
   *
   * @param detail - MatchupDetail with team1/team2 aggregates
   * @returns `{ team1, team2 }` point totals summing to 4
   */
  function getMatchPoints(detail: MatchupDetail) {
    const h1 = detail.team1.handicapPerGame
    const h2 = detail.team2.handicapPerGame
    const t1 =
      // game1Total/game2Total/game3Total replace the old gameTotals.g1/g2/g3 fields
      calcPts(detail.team1.game1Total + h1, detail.team2.game1Total + h2) +
      calcPts(detail.team1.game2Total + h1, detail.team2.game2Total + h2) +
      calcPts(detail.team1.game3Total + h1, detail.team2.game3Total + h2) +
      calcPts(detail.team1.totalSeries, detail.team2.totalSeries)
    return { team1: t1, team2: 4 - t1 }
  }

  /* ── Date formatter ──────────────────────────────────────────────────────── */
  const formatDate = (dateStr: string) =>
    new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
    })

  const fmtPts = (n: number) => (n % 1 === 0 ? String(n) : n.toFixed(1))

  /* ── Handle bowler drill-through ─────────────────────────────────────────── */
  const handleSelectBowler = (id: string) => {
    setDetailMatchupId(null)
    onClose()
    navigate(`/bowlers?id=${id}`)
  }

  if (!isOpen || !weekEntry) return null

  return (
    <>
      {/* ── Main week matchups overlay ────────────────────────────────────── */}
      <div
        className="modal-overlay week-matchups-overlay"
        onClick={e => { if (e.target === e.currentTarget) onClose() }}
      >
        <div className="week-matchups-modal">

          {/* Header */}
          <div className="modal-header">
            <div className="wm-header-info">
              <h2>
                {weekEntry.status === 'skip'
                  ? 'No Bowling This Week'
                  : `Week ${weekEntry.week ?? ''} Matchups`}
              </h2>
              <span className="wm-date">{formatDate(weekEntry.date)}</span>
              {weekEntry.status === 'upcoming' && (
                <span className="wm-badge wm-badge--upcoming">Upcoming</span>
              )}
              {weekEntry.status === 'completed' && (
                <div className="wm-header-badges">
                  <span className="wm-badge wm-badge--completed">Final</span>
                  {weekEntry.week != null && getStandingsPdfId(weekEntry.week) && (
                    <button
                      className="standings-pdf-btn"
                      onClick={() => setPdfWeek(weekEntry.week ?? null)}
                      aria-label={`View standings PDF for Week ${weekEntry.week}`}
                    >
                      <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                        <path d="M14 4.5V14a2 2 0 01-2 2H4a2 2 0 01-2-2V2a2 2 0 012-2h5.5L14 4.5zm-3 0A1.5 1.5 0 019.5 3V1H4a1 1 0 00-1 1v12a1 1 0 001 1h8a1 1 0 001-1V4.5h-2z"/>
                      </svg>
                      Standings PDF
                    </button>
                  )}
                </div>
              )}
            </div>
            <button className="modal-close-button" onClick={onClose} aria-label="Close">✕</button>
          </div>

          {/* Body */}
          <div className="modal-body wm-body">

            {/* ── Completed week: show scores ─────────────────────────────── */}
            {weekEntry.status === 'completed' && (
              <div className="wm-scoreboard">
                <table className="wm-table">
                  <thead>
                    <tr>
                      <th className="wm-col-team wm-left">Team</th>
                      <th className="wm-col-pts center">Pts</th>
                      <th className="wm-col-score center">Total</th>
                      <th className="wm-col-sep center">Lanes</th>
                      <th className="wm-col-score center">Total</th>
                      <th className="wm-col-pts center">Pts</th>
                      <th className="wm-col-team wm-right">Team</th>
                      <th className="wm-col-action"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {completedMatchups.map(match => {
                      const pts = getMatchPoints(match)
                      const t1Won = match.team1.totalSeries > match.team2.totalSeries
                      const t2Won = match.team2.totalSeries > match.team1.totalSeries

                      return (
                        <tr key={match.id} className="wm-row">
                          <td className={`wm-col-team wm-left wm-team-cell ${t1Won ? 'wm-winner' : ''}`}>
                            {match.team1.teamName}
                          </td>
                          <td className={`wm-col-pts center wm-pts-cell ${t1Won ? 'wm-pts-winner' : ''}`}>
                            {fmtPts(pts.team1)}
                          </td>
                          <td className={`wm-col-score center wm-score-cell ${t1Won ? 'wm-winner' : ''}`}>
                            <span title={`Scratch: ${match.team1.scratchSeries} + HDCP: ${match.team1.handicapSeries}`}>
                              {match.team1.totalSeries}
                            </span>
                            {match.team1.handicapSeries > 0 && (
                              <span
                                className="score-hcp"
                                title={`Scratch: ${match.team1.scratchSeries} + HDCP: ${match.team1.handicapSeries}`}
                              >
                                (+{match.team1.handicapSeries})
                              </span>
                            )}
                          </td>
                          <td className="wm-col-sep center wm-sep-cell">
                            –
                            <div className="wm-lane-badge">
                              Lanes {match.team1.lane} &amp; {match.team1.lane + 1}
                            </div>
                          </td>
                          <td className={`wm-col-score center wm-score-cell ${t2Won ? 'wm-winner' : ''}`}>
                            <span title={`Scratch: ${match.team2.scratchSeries} + HDCP: ${match.team2.handicapSeries}`}>
                              {match.team2.totalSeries}
                            </span>
                            {match.team2.handicapSeries > 0 && (
                              <span
                                className="score-hcp"
                                title={`Scratch: ${match.team2.scratchSeries} + HDCP: ${match.team2.handicapSeries}`}
                              >
                                (+{match.team2.handicapSeries})
                              </span>
                            )}
                          </td>
                          <td className={`wm-col-pts center wm-pts-cell ${t2Won ? 'wm-pts-winner' : ''}`}>
                            {fmtPts(pts.team2)}
                          </td>
                          <td className={`wm-col-team wm-right wm-team-cell ${t2Won ? 'wm-winner' : ''}`}>
                            {match.team2.teamName}
                          </td>
                          <td className="wm-col-action">
                            <button
                              className="wm-detail-btn"
                              onClick={() => setDetailMatchupId(match.id ?? null)}
                              aria-label={`View full breakdown for ${match.team1.teamName} vs ${match.team2.teamName}`}
                            >
                              Details
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                {completedMatchups.length === 0 && (
                  <p className="wm-empty">No matchup data available for this week.</p>
                )}
              </div>
            )}

            {/* ── Upcoming week: show pairings ────────────────────────────── */}
            {weekEntry.status === 'upcoming' && (
              <div className="wm-scoreboard">
                <table className="wm-table">
                  <thead>
                    <tr>
                      <th className="wm-col-team wm-left">Team</th>
                      <th className="wm-col-sep center">vs</th>
                      <th className="wm-col-team wm-right">Team</th>
                    </tr>
                  </thead>
                  <tbody>
                    {upcomingPairings.map(m => (
                      <tr key={m.id} className="wm-row wm-row--upcoming">
                        <td className="wm-col-team wm-left wm-team-cell">
                          {/* team1Id/team2Id are now string leaguePalsId values */}
                          {teamNameMap[m.team1Id] ?? `Team ${m.team1Id}`}
                        </td>
                        <td className="wm-col-sep center wm-sep-cell">
                          vs
                          <div className="wm-lane-badge">
                            Lanes {m.team1Lane} &amp; {m.team2Lane}
                          </div>
                        </td>
                        <td className="wm-col-team wm-right wm-team-cell">
                          {teamNameMap[m.team2Id] ?? `Team ${m.team2Id}`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {upcomingPairings.length === 0 && (
                  <p className="wm-empty">Matchup pairings not yet available.</p>
                )}
              </div>
            )}

            {/* ── Skip week ───────────────────────────────────────────────── */}
            {weekEntry.status === 'skip' && weekEntry.skipReason && (
              <div className="wm-skip-message">
                <span className="wm-skip-icon">🎳</span>
                <p>League is off this week in observance of <strong>{weekEntry.skipReason}</strong>.</p>
                <p className="wm-skip-sub">See you next Thursday!</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Nested match-detail modal (completed weeks only) ─────────────── */}
      <MatchupDetailModal
        matchupId={detailMatchupId}
        onClose={() => setDetailMatchupId(null)}
        onSelectBowler={handleSelectBowler}
      />

      {/* ── Standings PDF viewer ──────────────────────────────────────────── */}
      <StandingsPdfModal weekNum={pdfWeek} onClose={() => setPdfWeek(null)} />
    </>
  )
}

export default WeekMatchupsModal
