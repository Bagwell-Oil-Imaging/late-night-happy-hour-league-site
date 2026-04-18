import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import bowlerStatsData from '../data/bowlerStats.json'
import type { BowlerStat } from '../types'
import '../components/BowlerProfileModal.css'
import './BowlersPage.css'

function BowlersPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const bowlerStats = bowlerStatsData as BowlerStat[]

  const sortedBowlers = useMemo(() =>
    [...bowlerStats].sort((a, b) => a.name.localeCompare(b.name)),
    [bowlerStats]
  )

  const bowlerIdParam = searchParams.get('id')
  const selectedBowlerId = bowlerIdParam ?? sortedBowlers[0]?.id
  const bowler = useMemo(() =>
    bowlerStats.find(b => b.id === selectedBowlerId),
    [bowlerStats, selectedBowlerId]
  )

  const selectBowler = (id: string) => setSearchParams({ id })

  const formatDate = (dateString: string) => {
    const d = new Date(dateString + 'T12:00:00')
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const formatLanePair = (lane: number | null | undefined) => {
    if (lane == null) return <span>—</span>
    const odd = lane % 2 === 1 ? lane : lane - 1
    const even = odd + 1
    return lane === odd
      ? <><strong>{odd}</strong> | {even}</>
      : <>{odd} | <strong>{even}</strong></>
  }

  const gamesPlayed = bowler?.weeks.length ?? 0
  const totalPins = bowler?.weeks.reduce((s, w) => s + w.series, 0) ?? 0
  const computedAvg = gamesPlayed > 0 ? Math.round(totalPins / (gamesPlayed * 3)) : 0

  const bowlersByTeam = useMemo(() => {
    const groups: Record<string, { teamName: string; bowlers: BowlerStat[] }> = {}
    for (const b of sortedBowlers) {
      const key = String(b.teamId)
      if (!groups[key]) groups[key] = { teamName: b.teamName, bowlers: [] }
      groups[key].bowlers.push(b)
    }
    return Object.entries(groups).sort((a, b) => a[1].teamName.localeCompare(b[1].teamName))
  }, [sortedBowlers])

  return (
    <div className="bowlers-page">
      <h2 className="section-title">Bowler Stats</h2>

      <div className="bowlers-layout">
        <aside className="bowlers-sidebar">
          {bowlersByTeam.map(([teamId, { teamName, bowlers }]) => (
            <div key={teamId} className="sidebar-team-group">
              <div className="sidebar-team-label">{teamName}</div>
              {bowlers.map(b => (
                <button
                  key={b.id}
                  className={`bowler-list-btn ${b.id === selectedBowlerId ? 'active' : ''}`}
                  onClick={() => selectBowler(b.id)}
                >
                  <span className="bowler-list-name">{b.name}</span>
                  <span className="bowler-list-avg">{b.average}</span>
                </button>
              ))}
            </div>
          ))}
        </aside>

        <div className="bowler-detail-panel">
          {bowler ? (
            <>
              <div className="bowler-detail-title">
                <h3 className="bowler-detail-name">{bowler.name}</h3>
                <span className="bowler-team-name">{bowler.teamName}</span>
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
                            <td className={`col-game ${isHighGame && week.g1 === bowler.highGame ? 'high-game' : ''}`}>{week.g1}</td>
                            <td className={`col-game ${isHighGame && week.g2 === bowler.highGame ? 'high-game' : ''}`}>{week.g2}</td>
                            <td className={`col-game ${isHighGame && week.g3 === bowler.highGame ? 'high-game' : ''}`}>{week.g3}</td>
                            <td className={`col-series ${isHighSeries ? 'high-series' : ''}`}>{week.series}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : (
            <p className="no-data">Select a bowler to view their stats.</p>
          )}
        </div>
      </div>
    </div>
  )
}

export default BowlersPage
