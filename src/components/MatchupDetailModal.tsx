import { useEffect } from 'react'
import matchupDetailsData from '../data/weeklyMatchupDetails.json'
import bowlerStatsData from '../data/bowlerStats.json'
import type { MatchupDetail, BowlerStat } from '../types'
import './MatchupDetailModal.css'

interface MatchupDetailModalProps {
  matchupId: number | null
  onClose: () => void
  onSelectBowler: (bowlerId: string) => void
}

function MatchupDetailModal({ matchupId, onClose, onSelectBowler }: MatchupDetailModalProps) {
  const matchupDetails = matchupDetailsData as MatchupDetail[]
  const bowlerStats = bowlerStatsData as BowlerStat[]
  const isOpen = matchupId !== null

  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : 'unset'
    return () => { document.body.style.overflow = 'unset' }
  }, [isOpen])

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose()
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const match = matchupDetails.find(m => m.id === matchupId)
  if (!match) return null

  const formatDate = (dateString: string) => {
    const date = new Date(dateString + 'T12:00:00')
    return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
  }

  // Map bowler name → bowler ID for click-through to profile
  const bowlerNameToId = new Map<string, string>()
  for (const stat of bowlerStats) {
    bowlerNameToId.set(stat.name, stat.id)
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
                <div key={team.id} className={`matchup-team-panel ${isWinner ? 'winner-panel' : ''}`}>
                  <div className="team-panel-header">
                    <span className={`team-panel-name ${isWinner ? 'winner' : ''}`}>{team.name}</span>
                    <span className="team-panel-lane">Lane {team.lane}</span>
                  </div>

                  <div className="scores-table-wrapper">
                    <table className="matchup-scores-table">
                      <thead>
                        <tr>
                          <th className="col-name">Bowler</th>
                          <th className="col-game">G1</th>
                          <th className="col-game">G2</th>
                          <th className="col-game">G3</th>
                          <th className="col-series">Series</th>
                        </tr>
                      </thead>
                      <tbody>
                        {team.bowlers.map((bowler, i) => {
                          const bowlerId = bowlerNameToId.get(bowler.name)
                          return (
                            <tr key={i} className="bowler-row">
                              <td className="col-name">
                                {bowlerId ? (
                                  <button
                                    className="bowler-name-link"
                                    onClick={() => onSelectBowler(bowlerId)}
                                  >
                                    {bowler.name}
                                  </button>
                                ) : (
                                  <span>{bowler.name}</span>
                                )}
                                <span className="bowler-avg">avg {bowler.average}</span>
                              </td>
                              <td className="col-game">{bowler.g1}</td>
                              <td className="col-game">{bowler.g2}</td>
                              <td className="col-game">{bowler.g3}</td>
                              <td className="col-series">{bowler.series}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="totals-row scratch-row">
                          <td className="col-name">Scratch</td>
                          <td className="col-game">{team.gameTotals.g1}</td>
                          <td className="col-game">{team.gameTotals.g2}</td>
                          <td className="col-game">{team.gameTotals.g3}</td>
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
                          <td className="col-game">{team.gameTotals.g1 + team.handicapPerGame}</td>
                          <td className="col-game">{team.gameTotals.g2 + team.handicapPerGame}</td>
                          <td className="col-game">{team.gameTotals.g3 + team.handicapPerGame}</td>
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
