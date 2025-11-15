import teamsData from '../data/teams.json'
import type { Team } from '../types'
import './LeagueStandings.css'

function LeagueStandings() {
  const teams = [...(teamsData as Team[])].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points
    return b.wins - a.wins
  })

  const getWinPercentage = (wins: number, losses: number) => {
    const total = wins + losses
    if (total === 0) return 0
    return ((wins / total) * 100).toFixed(1)
  }

  return (
    <div className="standings-container" id="standings">
      <h2 className="section-title">League Standings</h2>
      <div className="standings-table-wrapper">
        <table className="standings-table">
          <thead>
            <tr>
              <th>Rank</th>
              <th>Team</th>
              <th>Captain</th>
              <th className="center">W</th>
              <th className="center">L</th>
              <th className="center">Win %</th>
              <th className="center">Points</th>
            </tr>
          </thead>
          <tbody>
            {teams.map((team, index) => (
              <tr key={team.id} className={index < 3 ? 'top-three' : ''}>
                <td className="rank">
                  {index + 1}
                  {index === 0 && <span className="trophy">🏆</span>}
                </td>
                <td className="team-name">{team.name}</td>
                <td>{team.captain}</td>
                <td className="center wins">{team.wins}</td>
                <td className="center losses">{team.losses}</td>
                <td className="center">{getWinPercentage(team.wins, team.losses)}%</td>
                <td className="center points">{team.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default LeagueStandings
