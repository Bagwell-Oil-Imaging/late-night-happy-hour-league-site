import historicalData from '../data/historicalMatches.json'
import teamsData from '../data/teams.json'
import type { Matchup, Team } from '../types'
import './SeasonScores.css'

function SeasonScores() {
  const matches = historicalData as Matchup[]
  const teams = teamsData as Team[]

  const seasonMatches = [...matches]
    .filter(m => m.completed)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  const getTeamById = (id: number): Team | undefined => {
    return teams.find(t => t.id === id)
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  const getWinner = (matchup: Matchup) => {
    if (matchup.team1Score === null || matchup.team2Score === null) return null
    return matchup.team1Score > matchup.team2Score ? matchup.team1Id : matchup.team2Id
  }

  const groupedMatches = seasonMatches.reduce((acc, match) => {
    if (!acc[match.week]) {
      acc[match.week] = []
    }
    acc[match.week].push(match)
    return acc
  }, {} as Record<number, Matchup[]>)

  return (
    <div className="season-scores-container" id="scores">
      <h2 className="section-title">Season Scores</h2>
      {Object.entries(groupedMatches)
        .sort(([a], [b]) => Number(b) - Number(a))
        .map(([week, matches]) => (
          <div key={week} className="week-section">
            <h3 className="week-title">Week {week} - {formatDate(matches[0].date)}</h3>
            <div className="scores-table-wrapper">
              <table className="scores-table">
                <thead>
                  <tr>
                    <th>Team 1</th>
                    <th className="center">Score</th>
                    <th className="center"></th>
                    <th className="center">Score</th>
                    <th>Team 2</th>
                  </tr>
                </thead>
                <tbody>
                  {matches.map((match) => {
                    const team1 = getTeamById(match.team1Id)
                    const team2 = getTeamById(match.team2Id)
                    const winnerId = getWinner(match)

                    return (
                      <tr key={match.id}>
                        <td className={`team-name ${winnerId === match.team1Id ? 'winner' : ''}`}>
                          {team1?.name}
                        </td>
                        <td className={`center score ${winnerId === match.team1Id ? 'winner' : ''}`}>
                          {match.team1Score}
                        </td>
                        <td className="center divider">-</td>
                        <td className={`center score ${winnerId === match.team2Id ? 'winner' : ''}`}>
                          {match.team2Score}
                        </td>
                        <td className={`team-name ${winnerId === match.team2Id ? 'winner' : ''}`}>
                          {team2?.name}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))}
    </div>
  )
}

export default SeasonScores
