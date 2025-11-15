import teamsData from '../data/teams.json'
import type { Team } from '../types'
import './PlayoffBracket.css'

function PlayoffBracket() {
  const teams = teamsData as Team[]

  // Sort teams by wins (descending), then by points
  const sortedTeams = [...teams].sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins
    return b.points - a.points
  })

  // Top 8 teams make playoffs
  const playoffTeams = sortedTeams.slice(0, 8)

  // Standard 8-team bracket seeding: 1v8, 4v5, 2v7, 3v6
  const quarterfinals = [
    { seed1: 1, team1: playoffTeams[0], seed2: 8, team2: playoffTeams[7] },
    { seed1: 4, team1: playoffTeams[3], seed2: 5, team2: playoffTeams[4] },
    { seed1: 2, team1: playoffTeams[1], seed2: 7, team2: playoffTeams[6] },
    { seed1: 3, team1: playoffTeams[2], seed2: 6, team2: playoffTeams[5] }
  ]

  // Predict semifinals winners (higher seed advances)
  const semifinals = [
    {
      seed1: quarterfinals[0].seed1,
      team1: quarterfinals[0].team1,
      seed2: quarterfinals[1].seed1 < quarterfinals[1].seed2 ? quarterfinals[1].seed1 : quarterfinals[1].seed2,
      team2: quarterfinals[1].seed1 < quarterfinals[1].seed2 ? quarterfinals[1].team1 : quarterfinals[1].team2
    },
    {
      seed1: quarterfinals[2].seed1,
      team1: quarterfinals[2].team1,
      seed2: quarterfinals[3].seed1 < quarterfinals[3].seed2 ? quarterfinals[3].seed1 : quarterfinals[3].seed2,
      team2: quarterfinals[3].seed1 < quarterfinals[3].seed2 ? quarterfinals[3].team1 : quarterfinals[3].team2
    }
  ]

  // Finals (higher seeds from each half)
  const finals = {
    team1: semifinals[0].team1,
    team2: semifinals[1].team1
  }

  return (
    <div className="playoff-bracket-container" id="playoffs">
      <h2 className="section-title">Playoff Bracket</h2>
      <p className="bracket-description">
        Top 8 teams advance to playoffs • Matchups based on current standings
      </p>

      <div className="bracket">
        {/* Quarterfinals */}
        <div className="bracket-round">
          <h3 className="round-title">Quarterfinals</h3>
          <div className="matchups">
            {quarterfinals.map((matchup, idx) => (
              <div key={idx} className="matchup">
                <div className="team-slot">
                  <span className="seed">{matchup.seed1}</span>
                  <span className="team-name">{matchup.team1.name}</span>
                  <span className="team-record">({matchup.team1.wins}-{matchup.team1.losses})</span>
                </div>
                <div className="vs">vs</div>
                <div className="team-slot">
                  <span className="seed">{matchup.seed2}</span>
                  <span className="team-name">{matchup.team2.name}</span>
                  <span className="team-record">({matchup.team2.wins}-{matchup.team2.losses})</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Semifinals */}
        <div className="bracket-round">
          <h3 className="round-title">Semifinals</h3>
          <div className="matchups">
            {semifinals.map((matchup, idx) => (
              <div key={idx} className="matchup">
                <div className="team-slot projected">
                  <span className="seed">{matchup.seed1}</span>
                  <span className="team-name">{matchup.team1.name}</span>
                  <span className="team-record">({matchup.team1.wins}-{matchup.team1.losses})</span>
                </div>
                <div className="vs">vs</div>
                <div className="team-slot projected">
                  <span className="seed">{matchup.seed2}</span>
                  <span className="team-name">{matchup.team2.name}</span>
                  <span className="team-record">({matchup.team2.wins}-{matchup.team2.losses})</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Finals */}
        <div className="bracket-round finals-round">
          <h3 className="round-title">Championship</h3>
          <div className="matchups">
            <div className="matchup finals">
              <div className="team-slot projected">
                <span className="seed">1</span>
                <span className="team-name">{finals.team1.name}</span>
                <span className="team-record">({finals.team1.wins}-{finals.team1.losses})</span>
              </div>
              <div className="vs">vs</div>
              <div className="team-slot projected">
                <span className="seed">2</span>
                <span className="team-name">{finals.team2.name}</span>
                <span className="team-record">({finals.team2.wins}-{finals.team2.losses})</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <p className="bracket-note">
        * Projected matchups assume higher seeds advance
      </p>
    </div>
  )
}

export default PlayoffBracket
