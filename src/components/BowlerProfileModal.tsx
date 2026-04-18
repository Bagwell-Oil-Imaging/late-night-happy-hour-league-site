import { useEffect } from 'react'
import bowlerStatsData from '../data/bowlerStats.json'
import type { BowlerStat } from '../types'
import './BowlerProfileModal.css'

interface BowlerProfileModalProps {
  bowlerId: string | null
  onClose: () => void
}

function BowlerProfileModal({ bowlerId, onClose }: BowlerProfileModalProps) {
  const bowlerStats = bowlerStatsData as BowlerStat[]
  const isOpen = bowlerId !== null

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

  const bowler = bowlerStats.find(b => b.id === bowlerId)
  if (!bowler) return null

  const formatDate = (dateString: string) => {
    const date = new Date(dateString + 'T12:00:00')
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const formatLanePair = (lane: number | null | undefined) => {
    if (lane == null) return <span>—</span>
    const odd = lane % 2 === 1 ? lane : lane - 1
    const even = odd + 1
    return lane === odd
      ? <><strong>{odd}</strong> | {even}</>
      : <>{odd} | <strong>{even}</strong></>
  }

  const gamesPlayed = bowler.weeks.length
  const totalPins = bowler.weeks.reduce((s, w) => s + w.series, 0)
  const computedAvg = gamesPlayed > 0 ? Math.round(totalPins / (gamesPlayed * 3)) : 0

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="bowler-modal-content" onClick={e => e.stopPropagation()}>

        <div className="modal-header">
          <div className="bowler-header-info">
            <h2>{bowler.name}</h2>
            <span className="bowler-team-name">{bowler.teamName}</span>
          </div>
          <button className="modal-close-button" onClick={onClose} aria-label="Close bowler profile">
            ✕
          </button>
        </div>

        <div className="bowler-stats-bar">
          <div className="stat-item">
            <span className="stat-label">Current Avg</span>
            <span className="stat-value">{bowler.average}</span>
          </div>
          {bowler.enteringAvg > 0 && (
            <div className="stat-item">
              <span className="stat-label">Entering Avg</span>
              <span className="stat-value">{bowler.enteringAvg}</span>
            </div>
          )}
          <div className="stat-item">
            <span className="stat-label">High Game</span>
            <span className="stat-value highlight">{bowler.highGame}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">High Series</span>
            <span className="stat-value highlight">{bowler.highSeries}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Weeks Bowled</span>
            <span className="stat-value">{gamesPlayed}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Season Avg</span>
            <span className="stat-value">{computedAvg}</span>
          </div>
        </div>

        <div className="modal-body">
          {bowler.weeks.length === 0 ? (
            <p className="no-data">No scores recorded yet.</p>
          ) : (
            <div className="scores-table-wrapper">
              <table className="bowler-week-table">
                <thead>
                  <tr>
                    <th className="col-week">Wk</th>
                    <th className="col-date">Date</th>
                    <th className="col-lane">Lanes</th>
                    <th className="col-opp">Opponent</th>
                    <th className="col-game">G1</th>
                    <th className="col-game">G2</th>
                    <th className="col-game">G3</th>
                    <th className="col-series">Series</th>
                  </tr>
                </thead>
                <tbody>
                  {bowler.weeks.map((week, i) => {
                    const isHighSeries = week.series === bowler.highSeries
                    const isHighGame = [week.g1, week.g2, week.g3].some(g => g === bowler.highGame)
                    return (
                      <tr key={i} className="week-row">
                        <td className="col-week">{week.week}</td>
                        <td className="col-date">{formatDate(week.date)}</td>
                        <td className="col-lane">{formatLanePair(week.lane)}</td>
                        <td className="col-opp">{week.opponentTeamName || '—'}</td>
                        <td className={`col-game ${isHighGame && week.g1 === bowler.highGame ? 'high-game' : ''}`}>
                          {week.g1}
                        </td>
                        <td className={`col-game ${isHighGame && week.g2 === bowler.highGame ? 'high-game' : ''}`}>
                          {week.g2}
                        </td>
                        <td className={`col-game ${isHighGame && week.g3 === bowler.highGame ? 'high-game' : ''}`}>
                          {week.g3}
                        </td>
                        <td className={`col-series ${isHighSeries ? 'high-series' : ''}`}>
                          {week.series}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}

export default BowlerProfileModal
