/**
 * @file MatchupDetailModal.tsx
 * @component MatchupDetailModal
 *
 * Overlay modal showing the full team-aggregate breakdown for a single
 * completed matchup. Displays game-by-game scratch totals, handicap per
 * game, and the final handicap series for each team.
 *
 * Data is fetched from Firestore via `useMatchupDetail` — no static JSON
 * import.
 *
 * Field renames from the pre-migration schema:
 *  - `gameTotals.g1/g2/g3` → `game1Total/game2Total/game3Total` (TeamSummary)
 *  - `matchupId` prop type changed from `number | null` → `string | null`
 *    because Firestore document IDs are strings.
 *
 * Note: individual bowler rows have been removed from this component because
 * per-bowler scores are now in the `BowlerScore` collection. Bowler drill-
 * through is handled at the page level via BowlerProfileModal.
 */

import { useEffect } from 'react'
import { useMatchupDetail, useBowlerScoresByTeamWeek, useBowlers } from '../hooks'
import { useSeasonYear } from '../context/SeasonContext'
import './MatchupDetailModal.css'

interface MatchupDetailModalProps {
  /** Firestore document ID of the matchup detail to display, or null when closed. */
  matchupId: string | null
  onClose: () => void
  onSelectBowler: (bowlerId: string) => void
}

/**
 * MatchupDetailModal component.
 *
 * @param matchupId       - Firestore document ID to look up, or null to hide the modal.
 * @param onClose         - Callback invoked when the modal requests dismissal.
 * @param onSelectBowler  - Callback for bowler profile drill-through (reserved for
 *                          future use when individual scores are surfaced here).
 * @returns Modal JSX when open and data is available, null otherwise.
 */
function MatchupDetailModal({ matchupId, onClose, onSelectBowler }: MatchupDetailModalProps) {
  const SEASON_YEAR = useSeasonYear()
  // Fetch the single MatchupDetail document from Firestore (skips when null)
  const { data: match, loading } = useMatchupDetail(matchupId)
  const isOpen = matchupId !== null

  // Individual bowler scores for each team — hooks skip when match hasn't loaded
  const { data: team1ScoresRaw } = useBowlerScoresByTeamWeek(match?.team1?.teamId, match?.week, SEASON_YEAR)
  const { data: team2ScoresRaw } = useBowlerScoresByTeamWeek(match?.team2?.teamId, match?.week, SEASON_YEAR)

  // Client-side filter guards against stale data if the Firestore query returned
  // too many documents (e.g. a prior unconstrained subscription or a failed index).
  const team1Scores = team1ScoresRaw.filter(s => s.teamId === match?.team1?.teamId)
  const team2Scores = team2ScoresRaw.filter(s => s.teamId === match?.team2?.teamId)

  // Roster (bowler names) for teams whose individual scores are unavailable.
  // '__never__' sentinel prevents fetching all bowlers when not needed.
  const { data: team1Roster } = useBowlers(SEASON_YEAR,
    match?.team1?.individualScoresUnavailable ? match.team1.teamId : '__never__')
  const { data: team2Roster } = useBowlers(SEASON_YEAR,
    match?.team2?.individualScoresUnavailable ? match.team2.teamId : '__never__')

  /* ── Lock body scroll while open ────────────────────────────────────────── */
  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : 'unset'
    return () => { document.body.style.overflow = 'unset' }
  }, [isOpen])

  /* ── Escape key handler ──────────────────────────────────────────────────── */
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose()
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen, onClose])

  // Not open — render nothing
  if (!isOpen) return null

  // Open but still loading from Firestore
  if (loading) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="matchup-modal-content" onClick={e => e.stopPropagation()}>
          <div className="loading">Loading matchup details…</div>
        </div>
      </div>
    )
  }

  // Open and loaded, but document not found (e.g. deleted or bad ID)
  if (!match) return null

  /**
   * Formats a date string into a human-readable long-form date.
   *
   * @param dateString - ISO date string, e.g. "2025-01-09"
   * @returns Formatted string, e.g. "Thursday, January 9, 2025"
   */
  const formatDate = (dateString: string): string => {
    const date = new Date(dateString + 'T12:00:00')
    return date.toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
    })
  }

  const team1Won = match.team1.totalSeries > match.team2.totalSeries
  const team2Won = match.team2.totalSeries > match.team1.totalSeries

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="matchup-modal-content" onClick={e => e.stopPropagation()}>

        <div className="modal-header">
          <div className="matchup-header-info">
            <h2>Week {match.week} Matchup</h2>
            <span className="matchup-date">{formatDate(match.date)}</span>
          </div>
          <button className="modal-close-button" onClick={onClose} aria-label="Close matchup detail">
            ✕
          </button>
        </div>

        <div className="modal-body matchup-body">
          <div className="matchup-teams">
            {[match.team1, match.team2].map((team, idx) => {
              const isWinner = idx === 0 ? team1Won : team2Won
              const scores = idx === 0 ? team1Scores : team2Scores
              const roster = idx === 0 ? team1Roster : team2Roster
              return (
                <div key={team.teamId} className={`matchup-team-panel ${isWinner ? 'winner-panel' : ''}`}>
                  <div className="team-panel-header">
                    <span className={`team-panel-name ${isWinner ? 'winner' : ''}`}>{team.teamName}</span>
                    <span className="team-panel-lane">Lane {team.lane}</span>
                  </div>

                  {/*
                    Two-table layout so Scratch / Handicap / Total always pin to
                    the bottom of both equally-tall grid cells regardless of how
                    many bowlers each team has.
                    - bowler-table  grows (flex: 1) to absorb any leftover height
                    - totals-table  is fixed height and always at the bottom
                  */}
                  <div className="scores-table-wrapper">

                    {/* Bowler rows — grows to fill available space */}
                    <table className="matchup-scores-table bowler-table">
                      <thead>
                        <tr>
                          <th className="col-name"></th>
                          <th className="col-game">G1</th>
                          <th className="col-game">G2</th>
                          <th className="col-game">G3</th>
                          <th className="col-series">Series</th>
                        </tr>
                      </thead>
                      <tbody>
                        {team.individualScoresUnavailable ? (
                          /*
                           * Per-bowler scores were not recorded — show roster names with
                           * dash placeholders so the scorecard still lists the players.
                           * Falls back to a single placeholder row if the roster is empty.
                           */
                          roster.length > 0 ? roster.map(b => (
                            <tr key={b.id} className="scores-unavailable-row">
                              <td className="col-name">{b.name}</td>
                              <td className="col-game scores-unavailable-cell">—</td>
                              <td className="col-game scores-unavailable-cell">—</td>
                              <td className="col-game scores-unavailable-cell">—</td>
                              <td className="col-series scores-unavailable-cell">—</td>
                            </tr>
                          )) : (
                            <tr className="scores-unavailable-row">
                              <td className="col-name scores-unavailable-label">* Individual scores not available</td>
                              <td className="col-game scores-unavailable-cell">—</td>
                              <td className="col-game scores-unavailable-cell">—</td>
                              <td className="col-game scores-unavailable-cell">—</td>
                              <td className="col-series scores-unavailable-cell">—</td>
                            </tr>
                          )
                        ) : (
                          scores.map((s) => (
                            <tr
                              key={s.bowlerId}
                              className="bowler-score-row"
                              onClick={() => onSelectBowler(s.bowlerId)}
                              style={{ cursor: 'pointer' }}
                            >
                              <td className="col-name">{s.bowlerName}</td>
                              <td className="col-game">{s.game1 ?? '—'}</td>
                              <td className="col-game">{s.game2 ?? '—'}</td>
                              <td className="col-game">{s.game3 ?? '—'}</td>
                              <td className="col-series">{s.series ?? '—'}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>

                    {team.individualScoresUnavailable && (
                      <p className="scores-unavailable-legend">
                        * Individual bowler scores were not recorded for this matchup.
                        Team game totals and match points are accurate.
                      </p>
                    )}

                    {/* Totals — pinned to the bottom of the panel */}
                    <table className="matchup-scores-table totals-table">
                      <tbody>
                        <tr className="totals-row scratch-row">
                          <td className="col-name">Scratch</td>
                          {team.individualScoresUnavailable ? (
                            <><td className="col-game scores-unavailable-cell">—</td>
                              <td className="col-game scores-unavailable-cell">—</td>
                              <td className="col-game scores-unavailable-cell">—</td>
                              <td className="col-series scores-unavailable-cell">—</td></>
                          ) : (
                            <><td className="col-game">{team.game1Total}</td>
                              <td className="col-game">{team.game2Total}</td>
                              <td className="col-game">{team.game3Total}</td>
                              <td className="col-series">{team.scratchSeries}</td></>
                          )}
                        </tr>
                        <tr className="totals-row handicap-row">
                          <td className="col-name">Handicap</td>
                          {team.individualScoresUnavailable ? (
                            <><td className="col-game scores-unavailable-cell">—</td>
                              <td className="col-game scores-unavailable-cell">—</td>
                              <td className="col-game scores-unavailable-cell">—</td>
                              <td className="col-series scores-unavailable-cell">—</td></>
                          ) : (
                            <><td className="col-game">+{team.handicapPerGame}</td>
                              <td className="col-game">+{team.handicapPerGame}</td>
                              <td className="col-game">+{team.handicapPerGame}</td>
                              <td className="col-series">+{team.handicapSeries}</td></>
                          )}
                        </tr>
                        <tr className={`totals-row grand-total-row ${isWinner ? 'winner' : ''}`}>
                          <td className="col-name">Total</td>
                          <td className="col-game">{team.game1Total}</td>
                          <td className="col-game">{team.game2Total}</td>
                          <td className="col-game">{team.game3Total}</td>
                          <td className="col-series">
                            {team.individualScoresUnavailable ? (
                              team.totalSeries
                            ) : (
                              <>
                                <span title={`Scratch: ${team.scratchSeries} + HDCP: ${team.handicapSeries}`}>
                                  {team.totalSeries}
                                </span>
                                {team.handicapSeries > 0 && (
                                  <span
                                    className="score-hcp"
                                    title={`Scratch: ${team.scratchSeries} + HDCP: ${team.handicapSeries}`}
                                  >
                                    (+{team.handicapSeries})
                                  </span>
                                )}
                              </>
                            )}
                          </td>
                        </tr>
                      </tbody>
                    </table>

                  </div>
                </div>
              )
            })}
          </div>
        </div>

      </div>
    </div>
  )
}

export default MatchupDetailModal
