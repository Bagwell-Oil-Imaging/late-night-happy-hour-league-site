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
import { useMatchupDetail } from '../hooks'
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
function MatchupDetailModal({ matchupId, onClose, onSelectBowler: _onSelectBowler }: MatchupDetailModalProps) {
  // Fetch the single MatchupDetail document from Firestore (skips when null)
  const { data: match, loading } = useMatchupDetail(matchupId)
  const isOpen = matchupId !== null

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
              return (
                <div key={team.teamId} className={`matchup-team-panel ${isWinner ? 'winner-panel' : ''}`}>
                  <div className="team-panel-header">
                    <span className={`team-panel-name ${isWinner ? 'winner' : ''}`}>{team.teamName}</span>
                    <span className="team-panel-lane">Lane {team.lane}</span>
                  </div>

                  {/* Team totals table — game1Total/game2Total/game3Total (new schema) */}
                  <div className="scores-table-wrapper">
                    <table className="matchup-scores-table">
                      <thead>
                        <tr>
                          <th className="col-name"></th>
                          <th className="col-game">G1</th>
                          <th className="col-game">G2</th>
                          <th className="col-game">G3</th>
                          <th className="col-series">Series</th>
                        </tr>
                      </thead>
                      <tfoot>
                        <tr className="totals-row scratch-row">
                          <td className="col-name">Scratch</td>
                          {/* game1Total/game2Total/game3Total replace gameTotals.g1/g2/g3 */}
                          <td className="col-game">{team.game1Total}</td>
                          <td className="col-game">{team.game2Total}</td>
                          <td className="col-game">{team.game3Total}</td>
                          <td className="col-series">{team.scratchSeries}</td>
                        </tr>
                        <tr className="totals-row handicap-row">
                          <td className="col-name">Handicap</td>
                          <td className="col-game">+{team.handicapPerGame}</td>
                          <td className="col-game">+{team.handicapPerGame}</td>
                          <td className="col-game">+{team.handicapPerGame}</td>
                          <td className="col-series">+{team.handicapSeries}</td>
                        </tr>
                        <tr className={`totals-row grand-total-row ${isWinner ? 'winner' : ''}`}>
                          <td className="col-name">Total</td>
                          <td className="col-game">{team.game1Total + team.handicapPerGame}</td>
                          <td className="col-game">{team.game2Total + team.handicapPerGame}</td>
                          <td className="col-game">{team.game3Total + team.handicapPerGame}</td>
                          <td className="col-series">
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
                          </td>
                        </tr>
                      </tfoot>
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
