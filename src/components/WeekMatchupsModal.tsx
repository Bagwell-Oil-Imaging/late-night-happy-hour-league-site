/**
 * WeekMatchupsModal — shows all matchup pairings for a selected schedule week.
 *
 * For completed weeks, displays scores and win/loss state, and lets the user
 * drill into the full bowler breakdown via MatchupDetailModal.
 * For upcoming weeks, shows the scheduled team pairings without scores.
 */

import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import matchupDetailsData from '../data/weeklyMatchupDetails.json'
import upcomingMatchupsData from '../data/matchups.json'
import teamsData from '../data/teams.json'
import MatchupDetailModal from './MatchupDetailModal'
import type { ScheduleWeek, MatchupDetail, Matchup, Team } from '../types'
import './WeekMatchupsModal.css'

interface WeekMatchupsModalProps {
  /** The schedule week to display — null means the modal is closed. */
  weekEntry: ScheduleWeek | null
  onClose: () => void
}

function WeekMatchupsModal({ weekEntry, onClose }: WeekMatchupsModalProps) {
  const navigate = useNavigate()
  const isOpen = weekEntry !== null

  /** ID of the individual matchup the user drilled into (completed weeks only). */
  const [detailMatchupId, setDetailMatchupId] = useState<number | null>(null)

  const matchupDetails = matchupDetailsData as MatchupDetail[]
  const upcomingMatchups = upcomingMatchupsData as Matchup[]
  const teams = teamsData as Team[]

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

  /* ── Pre-build team name lookup ──────────────────────────────────────────── */
  const teamNameMap = useMemo(() => {
    const map: Record<number, string> = {}
    for (const t of teams) map[t.id] = t.name
    return map
  }, [teams])

  /* ── Matchup data for the selected week ──────────────────────────────────── */
  const completedMatchups = useMemo(() => {
    if (!weekEntry || weekEntry.status !== 'completed') return []
    return matchupDetails.filter(m => m.week === weekEntry.dataWeek)
  }, [weekEntry, matchupDetails])

  const upcomingPairings = useMemo(() => {
    if (!weekEntry || weekEntry.status !== 'upcoming') return []
    return upcomingMatchups.filter(m => m.week === weekEntry.dataWeek)
  }, [weekEntry, upcomingMatchups])

  /* ── Point calculation helper (mirrors MatchupsPage logic) ──────────────── */
  function calcPts(mine: number, theirs: number) {
    if (mine > theirs) return 1
    if (mine === theirs) return 0.5
    return 0
  }

  function getMatchPoints(detail: MatchupDetail) {
    const h1 = detail.team1.handicapPerGame
    const h2 = detail.team2.handicapPerGame
    const t1 =
      calcPts(detail.team1.gameTotals.g1 + h1, detail.team2.gameTotals.g1 + h2) +
      calcPts(detail.team1.gameTotals.g2 + h1, detail.team2.gameTotals.g2 + h2) +
      calcPts(detail.team1.gameTotals.g3 + h1, detail.team2.gameTotals.g3 + h2) +
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
                <span className="wm-badge wm-badge--completed">Final</span>
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
                      <th className="wm-col-sep center"></th>
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
                            {match.team1.name}
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
                          <td className="wm-col-sep center wm-sep-cell">–</td>
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
                            {match.team2.name}
                          </td>
                          <td className="wm-col-action">
                            <button
                              className="wm-detail-btn"
                              onClick={() => setDetailMatchupId(match.id)}
                              aria-label={`View full breakdown for ${match.team1.name} vs ${match.team2.name}`}
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
                          {teamNameMap[m.team1Id] ?? `Team ${m.team1Id}`}
                        </td>
                        <td className="wm-col-sep center wm-sep-cell">vs</td>
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
    </>
  )
}

export default WeekMatchupsModal
