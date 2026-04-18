import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import teamsData from '../data/teams.json'
import matchupDetailsData from '../data/weeklyMatchupDetails.json'
import type { Team, MatchupDetail } from '../types'
import '../components/MatchupDetailModal.css'
import './TeamsPage.css'

function TeamsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const teams = teamsData as Team[]
  const matchupDetails = matchupDetailsData as MatchupDetail[]

  const sortedTeams = useMemo(() =>
    [...teams].sort((a, b) => b.points - a.points),
    [teams]
  )

  const teamIdParam = searchParams.get('team')
  const selectedTeamId = teamIdParam ? parseInt(teamIdParam, 10) : sortedTeams[0]?.id
  const selectedTeam = teams.find(t => t.id === selectedTeamId)

  const teamMatchups = useMemo(() =>
    matchupDetails
      .filter(m => m.team1.id === selectedTeamId || m.team2.id === selectedTeamId)
      .sort((a, b) => a.week - b.week),
    [matchupDetails, selectedTeamId]
  )

  const selectTeam = (id: number) => setSearchParams({ team: String(id) })

  const formatDate = (dateString: string) => {
    const d = new Date(dateString + 'T12:00:00')
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  return (
    <div className="teams-page">
      <h2 className="section-title">Teams</h2>

      <div className="team-selector-scroll">
        <div className="team-pills">
          {sortedTeams.map(team => (
            <button
              key={team.id}
              className={`team-pill ${team.id === selectedTeamId ? 'active' : ''}`}
              onClick={() => selectTeam(team.id)}
            >
              {team.name}
            </button>
          ))}
        </div>
      </div>

      {selectedTeam && (
        <div className="team-content">
          <div className="team-record-bar">
            <div className="team-record-name">{selectedTeam.name}</div>
            <div className="team-record-stats">
              <div className="record-item">
                <span className="record-value wins">{selectedTeam.wins}</span>
                <span className="record-label">W</span>
              </div>
              <span className="record-sep">–</span>
              <div className="record-item">
                <span className="record-value losses">{selectedTeam.losses}</span>
                <span className="record-label">L</span>
              </div>
              <span className="record-sep">–</span>
              <div className="record-item">
                <span className="record-value">{selectedTeam.ties}</span>
                <span className="record-label">T</span>
              </div>
              <div className="record-points-badge">
                <span className="record-pts-value">{selectedTeam.points}</span>
                <span className="record-pts-label">pts</span>
              </div>
            </div>
          </div>

          <div className="team-weeks-list">
            {teamMatchups.length === 0 ? (
              <p className="no-data">No match data available yet.</p>
            ) : (
              teamMatchups.map(match => {
                const isTeam1 = match.team1.id === selectedTeamId
                const myTeam = isTeam1 ? match.team1 : match.team2
                const oppTeam = isTeam1 ? match.team2 : match.team1
                const won = myTeam.totalSeries > oppTeam.totalSeries
                const lost = myTeam.totalSeries < oppTeam.totalSeries

                return (
                  <div key={match.id} className={`team-week-card ${won ? 'won' : lost ? 'lost' : 'tied'}`}>
                    <div className="team-week-header">
                      <div className="week-meta">
                        <span className="week-badge">Wk {match.week}</span>
                        <span className="week-date-label">{formatDate(match.date)}</span>
                        <span className="week-lane-label">Lane {myTeam.lane}</span>
                      </div>
                      <div className="week-result">
                        <span className="opp-name">vs {oppTeam.name}</span>
                        <span className={`result-chip ${won ? 'win' : lost ? 'loss' : 'tie'}`}>
                          {won ? 'WIN' : lost ? 'LOSS' : 'TIE'}
                        </span>
                        <span className="score-line">
                          {myTeam.totalSeries} – {oppTeam.totalSeries}
                        </span>
                      </div>
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
                          {myTeam.bowlers.map((bowler, i) => (
                            <tr key={i} className="bowler-row">
                              <td className="col-name">{bowler.name}</td>
                              <td className="col-game">{bowler.g1}</td>
                              <td className="col-game">{bowler.g2}</td>
                              <td className="col-game">{bowler.g3}</td>
                              <td className="col-series">{bowler.series}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="totals-row scratch-row">
                            <td className="col-name">Scratch</td>
                            <td className="col-game">{myTeam.gameTotals.g1}</td>
                            <td className="col-game">{myTeam.gameTotals.g2}</td>
                            <td className="col-game">{myTeam.gameTotals.g3}</td>
                            <td className="col-series">{myTeam.scratchSeries}</td>
                          </tr>
                          <tr className="totals-row handicap-row">
                            <td className="col-name">Handicap</td>
                            <td className="col-game">+{myTeam.handicapPerGame}</td>
                            <td className="col-game">+{myTeam.handicapPerGame}</td>
                            <td className="col-game">+{myTeam.handicapPerGame}</td>
                            <td className="col-series">+{myTeam.handicapSeries}</td>
                          </tr>
                          <tr className={`totals-row grand-total-row ${won ? 'winner' : ''}`}>
                            <td className="col-name">Total</td>
                            <td className="col-game">{myTeam.gameTotals.g1 + myTeam.handicapPerGame}</td>
                            <td className="col-game">{myTeam.gameTotals.g2 + myTeam.handicapPerGame}</td>
                            <td className="col-game">{myTeam.gameTotals.g3 + myTeam.handicapPerGame}</td>
                            <td className="col-series">{myTeam.totalSeries}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default TeamsPage
