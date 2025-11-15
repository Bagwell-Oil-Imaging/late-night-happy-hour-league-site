import matchupsData from '../data/matchups.json'
import teamsData from '../data/teams.json'
import type { Matchup, Team } from '../types'
import './FutureMatchups.css'

function FutureMatchups() {
  const matchups = matchupsData as Matchup[]
  const teams = teamsData as Team[]

  const futureMatchups = matchups.filter(m => !m.completed)

  const getTeamById = (id: number): Team | undefined => {
    return teams.find(t => t.id === id)
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    })
  }

  const groupedMatchups = futureMatchups.reduce((acc, matchup) => {
    if (!acc[matchup.week]) {
      acc[matchup.week] = []
    }
    acc[matchup.week].push(matchup)
    return acc
  }, {} as Record<number, Matchup[]>)

  return (
    <div className="future-matchups-container" id="schedule">
      <h2 className="section-title">Future Matchups</h2>
      {Object.entries(groupedMatchups).map(([week, matches]) => (
        <div key={week} className="week-section">
          <h3 className="week-title">Week {week} - {formatDate(matches[0].date)}</h3>
          <div className="matchups-table-wrapper">
            <table className="matchups-table">
              <thead>
                <tr>
                  <th>Team 1</th>
                  <th className="center">Record</th>
                  <th className="center">VS</th>
                  <th className="center">Record</th>
                  <th>Team 2</th>
                </tr>
              </thead>
              <tbody>
                {matches.map((matchup) => {
                  const team1 = getTeamById(matchup.team1Id)
                  const team2 = getTeamById(matchup.team2Id)

                  return (
                    <tr key={matchup.id}>
                      <td className="team-name">{team1?.name}</td>
                      <td className="center team-record">{team1?.wins}-{team1?.losses}</td>
                      <td className="center vs-cell">vs</td>
                      <td className="center team-record">{team2?.wins}-{team2?.losses}</td>
                      <td className="team-name">{team2?.name}</td>
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

export default FutureMatchups
